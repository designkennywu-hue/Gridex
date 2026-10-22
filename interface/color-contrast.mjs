// WCAG relative luminance for opaque map colors (hex, rgb or hsl).
export function luminance(color){
 let rgb;
 const hex=/^#([\da-f]{6})$/i.exec(color);
 if(hex)rgb=[0,2,4].map(i=>parseInt(hex[1].slice(i,i+2),16)/255);
 else if(/^hsl\(/i.test(color)){
  const [h,s,l]=color.match(/[\d.]+/g).map(Number),light=l/100,sat=s/100;
  const a=sat*Math.min(light,1-light);
  rgb=[0,8,4].map(n=>{const k=(n+h/30)%12;return light-a*Math.max(-1,Math.min(k-3,9-k,1));});
 }else if(/^rgb\(/i.test(color))rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255);
 else throw new Error('Unsupported contrast color: '+color);
 const linear=rgb.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
}
export function contrastRatio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function avatarTextColor(background){
 if(contrastRatio('#171717',background)>=4.5)return '#171717';
 if(contrastRatio('#ffffff',background)>=4.5)return '#ffffff';
 return '#000000';
}
