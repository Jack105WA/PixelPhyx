// Canvas rendering for PixelPhyx rigid bodies.
export function drawObjectBodies(ctx,bodies,drag,worldPoint){
 function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  for(const b of bodies){
   ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);
   if(b.type==='ball'){
    const g=ctx.createRadialGradient(-3,-4,1,0,0,6.5);g.addColorStop(0,'#fff4d1');g.addColorStop(.28,'#ffbd59');g.addColorStop(1,'#b94b2b');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,5.7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#612d27';ctx.lineWidth=1;ctx.stroke();
   }else if(b.type==='car'){
    ctx.fillStyle='#111923';roundRect(ctx,-16,-2.5,32,8,3);ctx.fillStyle='#e65355';roundRect(ctx,-15,-6.5,30,7,3);ctx.fillStyle='#f5b4a6';roundRect(ctx,-7.5,-11.5,15,6.5,2);ctx.fillStyle='#8ed7e8';roundRect(ctx,-5.8,-10.7,11.6,4.5,1);
    for(let i=0;i<2;i++){
     const x=i===0?-10.5:10.5,y=7.5+b.wheelY[i];ctx.save();ctx.translate(x,y);ctx.rotate(b.wheelSpin[i]);ctx.fillStyle='#20252d';ctx.beginPath();ctx.arc(0,0,3.15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#aeb9c7';ctx.beginPath();ctx.arc(0,0,1.35,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c8d1da';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(-2.2,0);ctx.lineTo(2.2,0);ctx.stroke();ctx.restore();
     ctx.strokeStyle=b.wheelGround[i]?'#c5d3df':'#687786';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,1);ctx.lineTo(x,2.2+b.wheelY[i]);ctx.stroke();
    }
    if(b.damage>.08){ctx.strokeStyle='#702f35';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-4,-5.5);ctx.lineTo(-1,-2);ctx.lineTo(2,-5);ctx.stroke()}
   }else if(b.type==='bucket'){
    ctx.fillStyle='#b5c3cf';ctx.beginPath();ctx.moveTo(-7,-8);ctx.lineTo(7,-8);ctx.lineTo(5,9);ctx.lineTo(-5,9);ctx.closePath();ctx.fill();ctx.strokeStyle='#526575';ctx.lineWidth=1.5;ctx.stroke();ctx.strokeStyle='#dbe6ed';ctx.beginPath();ctx.arc(0,-7,7,Math.PI,Math.PI*2);ctx.stroke();
   }else if(b.type==='crate'){
    ctx.fillStyle='#a86b3e';roundRect(ctx,-7.5,-7.5,15,15,1);ctx.strokeStyle='#5e3827';ctx.lineWidth=1.5;ctx.strokeRect(-6,-6,12,12);ctx.beginPath();ctx.moveTo(-6,-6);ctx.lineTo(6,6);ctx.moveTo(6,-6);ctx.lineTo(-6,6);ctx.stroke();
   }else{
    ctx.fillStyle='#447d91';roundRect(ctx,-6.5,-8.5,13,17,3);ctx.fillStyle='#9dc4ca';ctx.fillRect(-5,-5,10,2);ctx.fillStyle='#2c5264';ctx.fillRect(-6,5,12,2);
   }
   ctx.restore();
  }
  if(drag){const p=worldPoint(drag.body,drag.point.x,drag.point.y);ctx.strokeStyle='rgba(131,228,189,.8)';ctx.lineWidth=.8;ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(drag.target.x,drag.target.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#83e4bd';ctx.beginPath();ctx.arc(p.x,p.y,1.8,0,Math.PI*2);ctx.fill()}
  ctx.restore();
}
