// cord-capture — captures macOS system audio + microphone via ScreenCaptureKit,
// mixes both to mono 48 kHz 16-bit PCM, and streams it to stdout.
// Runs until SIGTERM/SIGINT. Errors go to stderr with a non-zero exit code.
//
// Build:  swiftc -O -o bin/cord-capture capture/cord-capture.swift
// Needs:  Screen Recording + Microphone permission for the hosting process.

import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia

let SAMPLE_RATE = 48000
let CHUNK = 1024 // frames per mix step

func fail(_ msg: String, code: Int32) -> Never {
    FileHandle.standardError.write(("cord-capture: " + msg + "\n").data(using: .utf8)!)
    exit(code)
}

// ---------- mixer: mic stream is the clock; system audio fills in ----------

final class Mixer {
    private let queue = DispatchQueue(label: "mixer")
    private var micBuf: [Float] = []
    private var sysBuf: [Float] = []
    private var sysDeficit = 0 // system frames we padded with silence and should drop later
    private var micSeen = false
    private var sysOnlyMode = false
    private let out = FileHandle.standardOutput

    func appendMic(_ samples: [Float]) {
        queue.async {
            self.micSeen = true
            self.micBuf.append(contentsOf: samples)
            self.drain()
        }
    }

    func appendSys(_ samples: [Float]) {
        queue.async {
            self.sysBuf.append(contentsOf: samples)
            if self.sysOnlyMode { self.drainSysOnly() }
        }
    }

    // If the mic never starts (e.g. permission denied for mic only),
    // fall back to recording system audio alone.
    func enableSysOnlyFallback() {
        queue.async {
            if !self.micSeen {
                self.sysOnlyMode = true
                FileHandle.standardError.write("cord-capture: no microphone samples — recording system audio only\n".data(using: .utf8)!)
            }
        }
    }

    private func drain() {
        while micBuf.count >= CHUNK {
            let mic = Array(micBuf.prefix(CHUNK))
            micBuf.removeFirst(CHUNK)

            // catch up on frames we previously padded
            if sysDeficit > 0 {
                let drop = min(sysDeficit, sysBuf.count)
                sysBuf.removeFirst(drop)
                sysDeficit -= drop
            }
            var sys: [Float]
            if sysBuf.count >= CHUNK {
                sys = Array(sysBuf.prefix(CHUNK))
                sysBuf.removeFirst(CHUNK)
            } else {
                sys = sysBuf
                sysDeficit += CHUNK - sysBuf.count
                sysBuf.removeAll()
                sys.append(contentsOf: [Float](repeating: 0, count: CHUNK - sys.count))
            }
            writeMixed(mic: mic, sys: sys)
        }
    }

    private func drainSysOnly() {
        while sysBuf.count >= CHUNK {
            let sys = Array(sysBuf.prefix(CHUNK))
            sysBuf.removeFirst(CHUNK)
            writeMixed(mic: [Float](repeating: 0, count: CHUNK), sys: sys)
        }
    }

    private func writeMixed(mic: [Float], sys: [Float]) {
        var pcm = [Int16](repeating: 0, count: CHUNK)
        for i in 0..<CHUNK {
            let v = max(-1.0, min(1.0, mic[i] + sys[i]))
            pcm[i] = Int16(v * 32767.0)
        }
        pcm.withUnsafeBufferPointer { buf in
            out.write(Data(buffer: buf))
        }
    }

    func flush() {
        queue.sync {
            if sysOnlyMode { drainSysOnly() } else { drain() }
        }
    }
}

// ---------- sample buffer → mono float @ 48k ----------

func monoSamples(from sampleBuffer: CMSampleBuffer) -> [Float]? {
    guard let desc = CMSampleBufferGetFormatDescription(sampleBuffer) else { return nil }
    let format = AVAudioFormat(cmAudioFormatDescription: desc)
    let frames = CMSampleBufferGetNumSamples(sampleBuffer)
    if frames <= 0 { return nil }
    guard let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)) else { return nil }
    pcm.frameLength = AVAudioFrameCount(frames)
    let status = CMSampleBufferCopyPCMDataIntoAudioBufferList(
        sampleBuffer, at: 0, frameCount: Int32(frames), into: pcm.mutableAudioBufferList)
    if status != noErr { return nil }
    guard let ch = pcm.floatChannelData else { return nil }

    let channels = Int(format.channelCount)
    var mono = [Float](repeating: 0, count: frames)
    if channels == 1 {
        for i in 0..<frames { mono[i] = ch[0][i] }
    } else {
        let scale = 1.0 / Float(channels)
        for c in 0..<channels {
            for i in 0..<frames { mono[i] += ch[c][i] * scale }
        }
    }

    // naive linear resample if the device isn't running at 48k
    let rate = Int(format.sampleRate)
    if rate != SAMPLE_RATE {
        let outFrames = frames * SAMPLE_RATE / rate
        if outFrames <= 0 { return nil }
        var res = [Float](repeating: 0, count: outFrames)
        for i in 0..<outFrames {
            let pos = Double(i) * Double(frames - 1) / Double(max(1, outFrames - 1))
            let i0 = Int(pos)
            let i1 = min(i0 + 1, frames - 1)
            let t = Float(pos - Double(i0))
            res[i] = mono[i0] * (1 - t) + mono[i1] * t
        }
        return res
    }
    return mono
}

// ---------- stream plumbing ----------

final class Output: NSObject, SCStreamOutput, SCStreamDelegate {
    let mixer: Mixer
    init(mixer: Mixer) { self.mixer = mixer }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard sampleBuffer.isValid else { return }
        switch type {
        case .audio:
            if let s = monoSamples(from: sampleBuffer) { mixer.appendSys(s) }
        case .microphone:
            if let s = monoSamples(from: sampleBuffer) { mixer.appendMic(s) }
        default:
            break
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fail("stream stopped: \(error.localizedDescription)", code: 4)
    }
}

// ---------- main ----------

let mixer = Mixer()
let output = Output(mixer: mixer)
var streamRef: SCStream?

signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)
let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
let sigint = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
let stopHandler: () -> Void = {
    if let s = streamRef {
        s.stopCapture { _ in
            mixer.flush()
            exit(0)
        }
        // hard exit if stopCapture never calls back
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            mixer.flush()
            exit(0)
        }
    } else {
        exit(0)
    }
}
sigterm.setEventHandler(handler: stopHandler)
sigint.setEventHandler(handler: stopHandler)
sigterm.resume()
sigint.resume()

Task {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            fail("no display found", code: 2)
        }
        let filter = SCContentFilter(display: display, excludingWindows: [])

        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = SAMPLE_RATE
        config.channelCount = 2
        config.captureMicrophone = true
        // video is required by SCK but unused — keep it as cheap as possible
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        config.showsCursor = false

        let stream = SCStream(filter: filter, configuration: config, delegate: output)
        streamRef = stream
        try stream.addStreamOutput(output, type: .audio, sampleHandlerQueue: DispatchQueue(label: "sys-audio"))
        try stream.addStreamOutput(output, type: .microphone, sampleHandlerQueue: DispatchQueue(label: "mic-audio"))
        try await stream.startCapture()
        FileHandle.standardError.write("cord-capture: capturing\n".data(using: .utf8)!)

        // if the mic never produces samples, keep going with system audio only
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            mixer.enableSysOnlyFallback()
        }
    } catch {
        fail("failed to start capture (check Screen Recording + Microphone permissions): \(error.localizedDescription)", code: 3)
    }
}

RunLoop.main.run()
