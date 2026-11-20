// Rope Verlet integration and distance constraints.
fn clamp(v:f32,a:f32,b:f32)->f32{v.max(a).min(b)}
fn collide_node(x:&mut f32,y:&mut f32,px:&mut f32,py:&mut f32,cells:&[u8],w:usize,h:usize){
 *x=clamp(*x,0.5,w as f32-0.5);*y=clamp(*y,0.5,h as f32-0.5);
 let cx=(*x as usize).min(w-1);let cy=(*y as usize).min(h-1);
 if !matches!(cells[cy*w+cx],3|4|10|12|15){return}
 let d=[*x-cx as f32,cx as f32+1.0-*x,*y-cy as f32,cy as f32+1.0-*y];
 let side=(0..4).min_by(|&a,&b|d[a].total_cmp(&d[b])).unwrap_or(0);
 match side{0=>{*x=cx as f32-0.002;*px=*x},1=>{*x=cx as f32+1.002;*px=*x},2=>{*y=cy as f32-0.002;*py=*y},_=>{*y=cy as f32+1.002;*py=*y}}
}
pub fn step_ropes(x:&mut[f32],y:&mut[f32],px:&mut[f32],py:&mut[f32],ox:&mut[f32],oy:&mut[f32],anchors:&[u8],drag:&[u8],offsets:&[u32],lengths:&[f32],cells:&[u8],w:usize,h:usize,gravity:f32){
 if w==0||h==0{return}
 let n=x.len().min(y.len()).min(px.len()).min(py.len()).min(ox.len()).min(oy.len()).min(anchors.len()).min(drag.len());
 if n<2||offsets.len()<2{return}
 let dt=0.5;
 for r in 0..offsets.len()-1{
  let start=(offsets[r] as usize).min(n);let end=(offsets[r+1] as usize).min(n);if end<=start+1{continue}
  let rest=lengths.get(r).copied().unwrap_or(1.0).max(0.001);
  for i in start..end{if drag[i]==0{ox[i]=x[i];oy[i]=y[i]}}
  for _ in 0..2{
   for i in start..end{
    if anchors[i]!=0{px[i]=x[i];py[i]=y[i];continue}
    let vx=(x[i]-px[i])*0.995;let vy=(y[i]-py[i])*0.995;px[i]=x[i];py[i]=y[i];
    x[i]+=vx;y[i]+=vy+0.22*gravity*dt*dt;
    collide_node(&mut x[i],&mut y[i],&mut px[i],&mut py[i],cells,w,h);
   }
   for _ in 0..10{
    for i in start..end-1{
     let j=i+1;let wa=if anchors[i]!=0{0.0}else{1.0};let wb=if anchors[j]!=0{0.0}else{1.0};let sum=wa+wb;if sum==0.0{continue}
     let dx=x[j]-x[i];let dy=y[j]-y[i];let d=(dx*dx+dy*dy).sqrt();if d<1e-7{continue}
     let e=(d-rest)/d*0.86;
     if wa!=0.0{x[i]+=dx*e*wa/sum;y[i]+=dy*e*wa/sum}
     if wb!=0.0{x[j]-=dx*e*wb/sum;y[j]-=dy*e*wb/sum}
    }
    for i in start+1..end-1{collide_node(&mut x[i],&mut y[i],&mut px[i],&mut py[i],cells,w,h)}
   }
  }
 }
}


#[cfg(test)]
mod tests {
    use super::step_ropes;

    #[test]
    fn anchored_rope_endpoints_remain_fixed_and_nodes_stay_finite() {
        let mut x = vec![1.0, 2.0, 3.0];
        let mut y = vec![1.0, 1.0, 1.0];
        let mut px = x.clone();
        let mut py = y.clone();
        let mut ox = x.clone();
        let mut oy = y.clone();
        let anchors = vec![1, 0, 1];
        let drag = vec![0; 3];
        let offsets = vec![0, 3];
        let lengths = vec![1.0];
        let cells = vec![0u8; 25];

        for _ in 0..20 {
            step_ropes(&mut x, &mut y, &mut px, &mut py, &mut ox, &mut oy,
                &anchors, &drag, &offsets, &lengths, &cells, 5, 5, 1.0);
        }

        assert_eq!((x[0], y[0]), (1.0, 1.0));
        assert_eq!((x[2], y[2]), (3.0, 1.0));
        assert!(x.iter().chain(y.iter()).all(|value| value.is_finite()));
    }

    #[test]
    fn invalid_or_empty_rope_inputs_are_safe() {
        let mut values = vec![0.0f32; 1];
        step_ropes(&mut values, &mut values.clone(), &mut values.clone(),
            &mut values.clone(), &mut values.clone(), &mut values.clone(),
            &[0], &[0], &[0, 1], &[1.0], &[0], 0, 4, 1.0);
    }
}
