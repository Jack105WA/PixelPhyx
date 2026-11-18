// Core particle force integration. Kept in WASM so the simulation tick has one
// authoritative implementation for gravity, drag, velocity limits, and sleeping.
pub fn prepare_velocity(cells: &[u8], velocity_x: &mut [f32], velocity_y: &mut [f32], gravity: f32) {
    let len = cells.len().min(velocity_x.len()).min(velocity_y.len());
    let acceleration = 0.055 * gravity.clamp(0.0, 3.0);

    for index in 0..len {
        if cells[index] == 0 {
            velocity_x[index] = 0.0;
            velocity_y[index] = 0.0;
            continue;
        }

        let vx = velocity_x[index];
        let vy = velocity_y[index];
        if vx.abs() + vy.abs() < 0.12 {
            velocity_x[index] = 0.0;
            velocity_y[index] = 0.0;
            continue;
        }

        velocity_y[index] = ((vy + acceleration) * 0.965).clamp(-16.0, 16.0);
        velocity_x[index] = (vx * 0.965).clamp(-16.0, 16.0);
    }

    velocity_x[len..].fill(0.0);
    velocity_y[len..].fill(0.0);
}


fn random(seed: u32, index: usize, salt: u32) -> f32 {
    let mut value=seed ^ (index as u32).wrapping_mul(0x9E37_79B9) ^ salt;
    value^=value>>16; value=value.wrapping_mul(0x7FEB_352D);
    value^=value>>15; value=value.wrapping_mul(0x846C_A68B);
    value^=value>>16;
    (value as f32)/(u32::MAX as f32)
}

fn swap_cell(
    cells:&mut [u8], updated:&mut [u8], a:usize, b:usize,
    vx:&mut [f32], vy:&mut [f32],
    wet:&mut [f32], heat:&mut [f32], heat_inputs:&mut [f32],
    fuel:&mut [f32], burn:&mut [f32], age:&mut [u16], corrosion:&mut [f32],
    moves:&mut Vec<u32>,
) {
    if a==b || a>=cells.len() || b>=cells.len() {return;}
    let material=cells[a]; let displaced=cells[b]; if material==0{return;}
    if displaced!=0 && !(material==1&&matches!(displaced,2|6)){return;}
    cells[b]=material;cells[a]=displaced;
    for values in [wet,heat,heat_inputs,fuel,burn,corrosion] {
        let value=values[a];values[a]=values[b];values[b]=value;
    }
    let old_age=age[a];age[a]=age[b];age[b]=old_age;
    let old_vx=vx[a];let old_vy=vy[a];vx[a]=vx[b];vy[a]=vy[b];vx[b]=old_vx;vy[b]=old_vy;
    updated[b]=1;if displaced!=0{updated[a]=1;}
    moves.push(a as u32);moves.push(b as u32);moves.push(material as u32);
    if displaced!=0{moves.push(b as u32);moves.push(a as u32);moves.push(displaced as u32);}
}

pub fn step_particles(
    cells:&mut [u8], updated:&mut [u8], vx:&mut [f32], vy:&mut [f32],
    wet:&mut [f32], heat:&mut [f32], heat_inputs:&mut [f32],
    fuel:&mut [f32], burn:&mut [f32], age:&mut [u16], corrosion:&mut [f32],
    width:usize,height:usize,gravity:f32,seed:u32,
)->Vec<u32>{
    let len=width.saturating_mul(height).min(cells.len()).min(updated.len())
        .min(vx.len()).min(vy.len()).min(wet.len()).min(heat.len())
        .min(heat_inputs.len()).min(fuel.len()).min(burn.len()).min(age.len()).min(corrosion.len());
    if width==0||height<2||len==0{return Vec::new();}
    let mut moves=Vec::new();
    prepare_velocity(&cells[..len],&mut vx[..len],&mut vy[..len],gravity);

    // First integrate existing momentum. A blocked step reflects velocity.
    for i in 0..len {
        if updated[i]!=0{continue;}
        if cells[i]==0 {vx[i]=0.0;vy[i]=0.0;continue;}
        let sx=if vx[i].abs()>0.42 {vx[i].signum() as isize}else{0};
        let sy=if vy[i].abs()>0.42 {vy[i].signum() as isize}else{0};
        if sx==0&&sy==0{continue;}
        let x=(i%width) as isize;let y=(i/width) as isize;
        let tx=x+sx;let ty=y+sy;
        if tx>=0&&ty>=0&&tx<width as isize&&ty<height as isize {
            let to=ty as usize*width+tx as usize;
            if to<len&&cells[to]==0 {
                swap_cell(cells,updated,i,to,vx,vy,wet,heat,heat_inputs,fuel,burn,age,corrosion,&mut moves);
                vx[to]*=0.94;vy[to]*=0.94;continue;
            }
        }
        if sx!=0 {vx[i]*=-0.72;}
        if sy!=0 {vy[i]*=-0.68;}
    }

    // Gravity and density movement. Direction and scan order are deterministic per tick.
    for y in (0..height-1).rev() {
        let reverse=random(seed,y,0xA11CE)<0.5;
        for k in 0..width {
            let x=if reverse {width-1-k}else{k};
            let i=y*width+x;
            if i>=len||cells[i]==0||updated[i]!=0{continue;}
            let m=cells[i];
            let gas=m==8||m==9||m==5;
            let movable=matches!(m,1|2|6|7|11|14|16);
            if !gas&&!movable{continue;}
            let dy:isize=if gas {-1}else{1};
            let ny=y as isize+dy;
            let vertical=if ny>=0&&ny<height as isize {Some(ny as usize*width+x)}else{None};
            if let Some(to)=vertical {
                if to<len&&(cells[to]==0||(m==1&&matches!(cells[to],2|6))) {
                    swap_cell(cells,updated,i,to,vx,vy,wet,heat,heat_inputs,fuel,burn,age,corrosion,&mut moves);
                    continue;
                }
            }
            if !gas && matches!(m,1|2|6|7|11|14|16) {
                let side=if random(seed,i,0x51DE)<0.5 {-1isize}else{1isize};
                let nx=x as isize+side;
                let ny=y as isize+dy;
                if nx>=0&&nx<width as isize&&ny>=0&&ny<height as isize {
                    let to=ny as usize*width+nx as usize;
                    if to<len&&(cells[to]==0||(m==1&&matches!(cells[to],2|6))) {
                        swap_cell(cells,updated,i,to,vx,vy,wet,heat,heat_inputs,fuel,burn,age,corrosion,&mut moves);
                        continue;
                    }
                }
                if matches!(m,2|6|7) {
                    let nx=x as isize+side;
                    if nx>=0&&nx<width as isize {
                        let to=y*width+nx as usize;
                        if to<len&&cells[to]==0&&random(seed,i,0x51DE_2)<0.4 {
                            swap_cell(cells,updated,i,to,vx,vy,wet,heat,heat_inputs,fuel,burn,age,corrosion,&mut moves);
                        }
                    }
                }
            }
        }
    }
    moves
}
