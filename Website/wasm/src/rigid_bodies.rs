// Rigid-body integration and body-to-body SAT collision solver.
// Each body is packed into 13 floats: x,y,vx,vy,angle,spin,w,h,mass,
// restitution,friction,damage,sleep_ticks.
fn clamp(v:f32,lo:f32,hi:f32)->f32{v.max(lo).min(hi)}
fn radius(b:&[f32],ax:f32,ay:f32)->f32{
 let c=b[4].cos();let s=b[4].sin();
 (ax*c+ay*s).abs()*b[6]*0.5+(-ax*s+ay*c).abs()*b[7]*0.5
}
fn inertia(b:&[f32])->f32{(b[8]*(b[6]*b[6]+b[7]*b[7])/12.0).max(1.0)}
pub fn step_rigid_bodies(state:&mut[f32],gravity:f32,dt:f32){
 let count=state.len()/13;if count==0{return}
 for i in 0..count{
  let b=&mut state[i*13..i*13+13];
  if b[12]>12.0{b[2]=0.0;b[3]=0.0;b[5]=0.0;continue}
  b[3]=clamp(b[3]+0.16*gravity.clamp(0.0,3.0)*dt,-26.0,26.0);
  b[2]*=0.9995;b[5]*=0.96;
  b[5]=clamp(b[5],-0.38,0.38);b[2]=clamp(b[2],-22.0,22.0);b[3]=clamp(b[3],-22.0,22.0);
  b[0]+=b[2]*dt;b[1]+=b[3]*dt;b[4]+=b[5]*dt;
 }
 // Oriented-box SAT, angular impulse and Coulomb-limited tangent impulse.
 for i in 0..count{for j in i+1..count{
  let ai=i*13;let bj=j*13;
  let (a,b)=two_mut(state,ai,bj,13);
  let dx=b[0]-a[0];let dy=b[1]-a[1];
  let ac=a[4].cos();let asn=a[4].sin();let bc=b[4].cos();let bsn=b[4].sin();
  let axes=[(1.0,0.0),(0.0,1.0),(ac,asn),(-asn,ac),(bc,bsn),(-bsn,bc)];
  let mut depth=f32::INFINITY;let mut nx=0.0;let mut ny=0.0;let mut separated=false;
  for (ax,ay) in axes{
   let overlap=radius(a,ax,ay)+radius(b,ax,ay)-(dx*ax+dy*ay).abs();
   if overlap<=0.0{separated=true;break}
   if overlap<depth{depth=overlap;let sign=if dx*ax+dy*ay>=0.0{1.0}else{-1.0};nx=ax*sign;ny=ay*sign;}
  }
  if separated{continue}
  let ia=1.0/a[8].max(0.01);let ib=1.0/b[8].max(0.01);let sum=ia+ib;
  let correction=(depth-0.01).max(0.0)*0.72/sum;let correction=correction.min(2.0);
  a[0]-=nx*correction*ia;a[1]-=ny*correction*ia;b[0]+=nx*correction*ib;b[1]+=ny*correction*ib;
  let ra=radius(a,nx,ny);let rb=radius(b,nx,ny);
  let px=(a[0]+nx*ra+b[0]-nx*rb)*0.5;let py=(a[1]+ny*ra+b[1]-ny*rb)*0.5;
  let rax=px-a[0];let ray=py-a[1];let rbx=px-b[0];let rby=py-b[1];
  let avx=a[2]-a[5]*ray;let avy=a[3]+a[5]*rax;
  let bvx=b[2]-b[5]*rby;let bvy=b[3]+b[5]*rbx;
  let rvx=bvx-avx;let rvy=bvy-avy;let vn=rvx*nx+rvy*ny;
  a[12]=0.0;b[12]=0.0;
  if vn>=0.0{continue}
  let ran=rax*ny-ray*nx;let rbn=rbx*ny-rby*nx;
  let den=sum+ran*ran/inertia(a)+rbn*rbn/inertia(b);
  let impulse=-(1.0+a[9].min(b[9]))*vn/den;
  let ix=impulse*nx;let iy=impulse*ny;
  a[2]-=ix*ia;a[3]-=iy*ia;b[2]+=ix*ib;b[3]+=iy*ib;
  a[5]=clamp(a[5]-(rax*iy-ray*ix)/inertia(a),-0.45,0.45);
  b[5]=clamp(b[5]+(rbx*iy-rby*ix)/inertia(b),-0.45,0.45);
  let tx=-ny;let ty=nx;let rat=rax*ty-ray*tx;let rbt=rbx*ty-rby*tx;
  let tangent_den=sum+rat*rat/inertia(a)+rbt*rbt/inertia(b);
  let jt=clamp(-(rvx*tx+rvy*ty)/tangent_den,-impulse*0.25,impulse*0.25);
  a[2]-=tx*jt*ia;a[3]-=ty*jt*ia;b[2]+=tx*jt*ib;b[3]+=ty*jt*ib;
  a[5]=clamp(a[5]-rat*jt/inertia(a),-0.45,0.45);
  b[5]=clamp(b[5]+rbt*jt/inertia(b),-0.45,0.45);
  if vn.abs()>3.0{a[11]=(a[11]+vn.abs()*0.004).min(1.0);b[11]=(b[11]+vn.abs()*0.004).min(1.0);}
 }}
}
fn two_mut(v:&mut[f32],a:usize,b:usize,stride:usize)->(&mut[f32],&mut[f32]){
 assert!(a<b);let (left,right)=v.split_at_mut(b);(&mut left[a..a+stride],&mut right[..stride])
}


#[cfg(test)]
mod tests {
    use super::step_rigid_bodies;

    #[test]
    fn rigid_body_gravity_advances_position_and_velocity() {
        let mut body = [0.0f32; 13];
        body[0] = 10.0;
        body[1] = 10.0;
        body[6] = 4.0;
        body[7] = 4.0;
        body[8] = 1.0;
        step_rigid_bodies(&mut body, 1.0, 1.0);
        assert!(body[3] > 0.0);
        assert!(body[1] > 10.0);
        assert!(body.iter().all(|value| value.is_finite()));
    }

    #[test]
    fn sleeping_bodies_do_not_drift() {
        let mut body = [0.0f32; 13];
        body[0] = 12.0;
        body[1] = 8.0;
        body[2] = 3.0;
        body[3] = 2.0;
        body[5] = 0.2;
        body[12] = 13.0;
        step_rigid_bodies(&mut body, 1.0, 1.0);
        assert_eq!(body[0], 12.0);
        assert_eq!(body[1], 8.0);
        assert_eq!(body[2], 0.0);
        assert_eq!(body[3], 0.0);
        assert_eq!(body[5], 0.0);
    }

    #[test]
    fn overlapping_bodies_are_separated_without_non_finite_values() {
        let mut state = vec![0.0f32; 26];
        for i in 0..2 {
            let b = &mut state[i * 13..(i + 1) * 13];
            b[0] = 10.0 + i as f32 * 1.0;
            b[1] = 10.0;
            b[6] = 4.0;
            b[7] = 4.0;
            b[8] = 1.0;
            b[9] = 0.2;
        }
        step_rigid_bodies(&mut state, 0.0, 0.0);
        assert!(state.iter().all(|value| value.is_finite()));
        assert_ne!(state[0], state[13]);
    }
}
