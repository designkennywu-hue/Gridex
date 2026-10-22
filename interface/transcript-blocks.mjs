// Speaker turns and semantic paragraphs are separate. Time alone never starts a turn.
export function transcriptBlocks(segments,paragraphStarts=[]){
 const starts=new Set(paragraphStarts),blocks=[];
 for(let i=0;i<segments.length;i++){
  const s=segments[i],last=blocks.at(-1),previous=segments[i-1];
  if(last&&last.speaker===s.speaker){
   const thoughtBreak=starts.has(s.index)||(previous&&s.start-previous.end>=1.2&&/[.!?]["”']?$/.test(previous.text));
   if(thoughtBreak)last.paragraphs.push({start:s.start,text:[]});
   last.paragraphs.at(-1).text.push(s.text);last.end=s.end;
  }else blocks.push({start:s.start,end:s.end,speaker:s.speaker,paragraphs:[{start:s.start,text:[s.text]}]});
 }return blocks;
}
