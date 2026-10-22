// Read only Zoom's accessible controls. No audio capture or permission prompts.
import AppKit
import ApplicationServices
func output(_ value:[String:Any]) { let data = try! JSONSerialization.data(withJSONObject:value); print(String(data:data,encoding:.utf8)!); }
func attribute(_ element:AXUIElement,_ name:String)->CFTypeRef? { var result:CFTypeRef?; return AXUIElementCopyAttributeValue(element,name as CFString,&result) == .success ? result:nil }
let apps=NSWorkspace.shared.runningApplications.filter{$0.bundleIdentifier == "us.zoom.xos"}
if !AXIsProcessTrusted() { output(["meeting":NSNull(),"reason":"Allow Accessibility access for the Gridex Zoom detector in System Settings."]); exit(0) }
if apps.isEmpty { output(["meeting":false,"reason":"Zoom is not running."]); exit(0) }
var uncertain=false
for app in apps {
 let root=AXUIElementCreateApplication(app.processIdentifier)
 AXUIElementSetMessagingTimeout(root,0.5)
 guard let windows=attribute(root,kAXWindowsAttribute) as? [AXUIElement] else { uncertain=true;continue }
 for (index,window) in windows.enumerated() {
  let title=(attribute(window,kAXTitleAttribute) as? String) ?? ""
  let identifier=(attribute(window,"AXIdentifier") as? String) ?? ""
  var queue:[(AXUIElement,Int)]=[(window,0)],names:[String]=[],visited=0
  while !queue.isEmpty && visited<1500 {
   let (element,depth)=queue.removeFirst();visited+=1
   for key in [kAXTitleAttribute,kAXDescriptionAttribute,kAXHelpAttribute,kAXRoleDescriptionAttribute] {if let value=attribute(element,key) as? String {names.append(value.lowercased())}}
   if depth<9,let children=attribute(element,kAXChildrenAttribute) as? [AXUIElement] { queue += children.map{($0,depth+1)} }
  }
  let leave=names.contains{$0 == "leave" || $0 == "end" || $0.contains("leave meeting") || $0.contains("end meeting")}
  let audio=names.contains{$0.contains("mute") || $0.contains("audio")}
  let waiting=names.contains{$0.contains("waiting for the host") || $0.contains("waiting room") || $0.contains("please wait for the host") || $0 == "joining" || $0 == "connecting"}
  let mainMeeting=identifier == "zm.meeting.window.main" && title.lowercased().contains("zoom meeting") && !waiting
  if (leave && audio && !waiting) || mainMeeting {
   output(["meeting":true,"key":"\(app.processIdentifier):\(index):\(title)","title":title,"reason":"Zoom meeting detected."]);exit(0)
  }
  if title.lowercased().contains("meeting") || title.lowercased().contains("webinar") { uncertain=true }
 }
}
output(["meeting":uncertain ? NSNull():false,"reason":uncertain ? "Zoom is open, but meeting controls could not be confirmed.":"No active Zoom meeting detected."])
