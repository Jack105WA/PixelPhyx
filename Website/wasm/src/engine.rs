use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, Default)]
struct Cell { material: u8, vx: f32, vy: f32, heat: f32, wet: f32 }

#[derive(Clone, Copy)]
struct Material { density: f32, gravity: f32, liquid: bool, gas: bool, color: [u8; 4] }

#[derive(Clone, Copy)]
struct Rope { ax: f32, ay: f32, bx: f32, by: f32, length: f32, stiffness: f32 }

#[derive(Clone, Copy)]
struct Body { x: f32, y: f32, vx: f32, vy: f32, half_w: f32, half_h: f32, mass: f32, angle: f32, angular_velocity: f32 }

#[wasm_bindgen]
pub struct World {
    width: usize, height: usize, cells: Vec<Cell>, materials: Vec<Material>,
    reactions: Vec<u8>, ropes: Vec<Rope>, bodies: Vec<Body>,
    gravity: f32, paused: bool, brush: u8, pointer_down: bool,
    pointer_x: f32, pointer_y: f32, brush_radius: usize,
}

#[wasm_bindgen]
impl World {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> World {
        let w = (width as usize).clamp(1, 2048);
        let h = (height as usize).clamp(1, 2048);
        let mut materials = vec![Material { density: 1.0, gravity: 1.0, liquid: false, gas: false, color: [0,0,0,0] }; 256];
        materials[1] = Material { density: 3.0, gravity: 1.0, liquid: false, gas: false, color: [190,180,150,255] };
        materials[2] = Material { density: 1.0, gravity: 1.0, liquid: true, gas: false, color: [50,130,230,255] };
        materials[3] = Material { density: 0.15, gravity: -0.15, liquid: false, gas: true, color: [180,190,205,180] };
        World { width:w, height:h, cells:vec![Cell::default(); w*h], materials,
            reactions:vec![0;256*256], ropes:Vec::new(), bodies:Vec::new(),
            gravity:1.0, paused:false, brush:1, pointer_down:false, pointer_x:0.0, pointer_y:0.0, brush_radius:2 }
    }

    pub fn dimensions(&self) -> Vec<u32> { vec![self.width as u32, self.height as u32] }
    pub fn set_gravity(&mut self, value:f32) { self.gravity=value.clamp(-4.0,4.0); }
    pub fn set_paused(&mut self, value:bool) { self.paused=value; }
    pub fn set_brush(&mut self, material:u32, radius:u32) { self.brush=material.min(255) as u8; self.brush_radius=radius.clamp(1,64) as usize; }
    pub fn configure_material(&mut self, id:u32, density:f32, gravity:f32, liquid:bool, gas:bool, rgba:&[u8]) {
        let i=(id.min(255)) as usize;
        let mut color=[0,0,0,255]; for n in 0..4 { if let Some(v)=rgba.get(n) { color[n]=*v; } }
        self.materials[i]=Material { density:density.max(0.001), gravity:gravity.clamp(-4.0,4.0), liquid, gas, color };
    }
    pub fn set_reaction(&mut self, a:u32, b:u32, result:u32) {
        self.reactions[(a.min(255)*256+b.min(255)) as usize]=result.min(255) as u8;
    }
    pub fn set_cell(&mut self, x:u32, y:u32, material:u32) {
        let i=self.index(x as usize,y as usize); if let Some(i)=i { self.cells[i]=Cell { material:material.min(255) as u8, ..Cell::default() }; }
    }
    pub fn get_cells(&self) -> Vec<u8> { self.cells.iter().map(|c|c.material).collect() }
    pub fn clear(&mut self) { self.cells.fill(Cell::default()); self.ropes.clear(); self.bodies.clear(); }
    pub fn particle_count(&self) -> u32 { self.cells.iter().filter(|c|c.material!=0).count() as u32 }

    pub fn pointer_move(&mut self,x:f32,y:f32) { self.pointer_x=x; self.pointer_y=y; }
    pub fn pointer_button(&mut self,down:bool) { self.pointer_down=down; if down { self.paint(); } }
    pub fn pointer_paint(&mut self) { if self.pointer_down { self.paint(); } }
    fn paint(&mut self) {
        let cx=self.pointer_x.round() as isize; let cy=self.pointer_y.round() as isize; let r=self.brush_radius as isize;
        for dy in -r..=r { for dx in -r..=r { if dx*dx+dy*dy<=r*r {
            let x=cx+dx; let y=cy+dy; if x>=0 && y>=0 && x<self.width as isize && y<self.height as isize {
                let i=y as usize*self.width+x as usize;
                self.cells[i]=Cell { material:self.brush, ..Cell::default() };
            }
        }}}
    }

    pub fn add_rope(&mut self, ax:f32, ay:f32, bx:f32, by:f32, length:f32, stiffness:f32) -> u32 {
        self.ropes.push(Rope { ax,ay,bx,by,length:length.max(0.1),stiffness:stiffness.clamp(0.0,1.0) }); (self.ropes.len()-1) as u32
    }
    pub fn add_body(&mut self,x:f32,y:f32,half_w:f32,half_h:f32,mass:f32) -> u32 {
        self.bodies.push(Body { x,y,vx:0.0,vy:0.0,half_w:half_w.max(1.0),half_h:half_h.max(1.0),mass:mass.max(0.01),angle:0.0,angular_velocity:0.0 }); (self.bodies.len()-1) as u32
    }
    pub fn body_count(&self)->u32 { self.bodies.len() as u32 }
    pub fn rope_count(&self)->u32 { self.ropes.len() as u32 }

    pub fn step(&mut self, iterations:u32) {
        if self.paused { return; }
        for _ in 0..iterations.clamp(1,8) { self.step_cells(); self.step_bodies(); self.solve_ropes(); }
    }
    fn step_cells(&mut self) {
        // Bottom-up traversal prevents a falling particle from moving twice in one tick.
        for y in (0..self.height).rev() { for x in 0..self.width {
            let i=y*self.width+x; let id=self.cells[i].material; if id==0 { continue; }
            let m=self.materials[id as usize]; self.cells[i].vy=(self.cells[i].vy+m.gravity*self.gravity*0.12).clamp(-4.0,4.0);
            self.cells[i].heat=(self.cells[i].heat*0.999).max(0.0);
            let dx=self.cells[i].vx.round() as isize; let dy=self.cells[i].vy.round() as isize;
            let mut moved=false;
            let dirs=[(dx,dy),(0,dy),(if x%2==0 {-1} else {1},dy),(if x%2==0 {1} else {-1},0)];
            for (sx,sy) in dirs {
                if sx==0 && sy==0 { continue; }
                let nx=x as isize+sx; let ny=y as isize+sy;
                if nx<0||ny<0||nx>=self.width as isize||ny>=self.height as isize { continue; }
                let ni=ny as usize*self.width+nx as usize; let other=self.cells[ni].material;
                if other==0 {
                    self.cells.swap(i,ni); self.cells[ni].vx*=0.96; self.cells[ni].vy*=0.96; moved=true; break;
                }
                let reaction=self.reactions[id as usize*256+other as usize];
                if reaction!=0 { self.cells[i].material=reaction; self.cells[ni]=Cell::default(); moved=true; break; }
                if self.materials[other as usize].density < m.density && (m.liquid||m.gas) {
                    self.cells.swap(i,ni); moved=true; break;
                }
            }
            if !moved { self.cells[i].vx*=0.82; self.cells[i].vy*=0.35; }
        }}
    }
    fn step_bodies(&mut self) {
        for b in &mut self.bodies {
            b.vy=(b.vy+self.gravity*0.18).clamp(-8.0,8.0); b.x+=b.vx; b.y+=b.vy;
            if b.x-b.half_w<0.0 { b.x=b.half_w; b.vx=b.vx.abs()*0.35; }
            if b.x+b.half_w>=self.width as f32 { b.x=self.width as f32-b.half_w-1.0; b.vx=-b.vx.abs()*0.35; }
            if b.y+b.half_h>=self.height as f32 { b.y=self.height as f32-b.half_h-1.0; b.vy=-b.vy.abs()*0.25; b.vx*=0.92; }
            if b.y-b.half_h<0.0 { b.y=b.half_h; b.vy=b.vy.abs()*0.25; }
            b.angle+=b.angular_velocity;
        }
        for i in 0..self.bodies.len() { for j in i+1..self.bodies.len() {
            let (a,b)=two_mut(&mut self.bodies,i,j);
            let dx=b.x-a.x; let dy=b.y-a.y; let ox=a.half_w+b.half_w-dx.abs(); let oy=a.half_h+b.half_h-dy.abs();
            if ox>0.0&&oy>0.0 { if ox<oy { let s=if dx>=0.0 {1.0} else {-1.0}; a.x-=s*ox*0.5; b.x+=s*ox*0.5; std::mem::swap(&mut a.vx,&mut b.vx); } else { let s=if dy>=0.0 {1.0} else {-1.0}; a.y-=s*oy*0.5; b.y+=s*oy*0.5; std::mem::swap(&mut a.vy,&mut b.vy); } }
        }}
    }
    fn solve_ropes(&mut self) {
        for r in &self.ropes { let dx=r.bx-r.ax; let dy=r.by-r.ay; let d=(dx*dx+dy*dy).sqrt().max(0.001); let correction=(d-r.length)/d*r.stiffness*0.5;
            let _constraint=(dx*correction,dy*correction); }
    }
    fn index(&self,x:usize,y:usize)->Option<usize> { if x<self.width&&y<self.height {Some(y*self.width+x)} else {None} }

    pub fn render_rgba(&self) -> Vec<u8> {
        let mut out=vec![0;self.cells.len()*4];
        for (i,c) in self.cells.iter().enumerate() { let col=self.materials[c.material as usize].color; let p=i*4;
            out[p]=col[0]; out[p+1]=col[1]; out[p+2]=col[2]; out[p+3]=col[3];
            if c.heat>0.0 { let k=(c.heat/1000.0).clamp(0.0,0.5); out[p]=((out[p] as f32)+(255.0-out[p] as f32)*k) as u8; }
        }
        for b in &self.bodies { let x=b.x as isize; let y=b.y as isize; for yy in -((b.half_h as isize))..=(b.half_h as isize) { for xx in -((b.half_w as isize))..=(b.half_w as isize) {
            let px=x+xx; let py=y+yy; if let Some(i)=self.index_signed(px,py) { let p=i*4; out[p]=220; out[p+1]=150; out[p+2]=90; out[p+3]=255; }
        }}}
        out
    }
    fn index_signed(&self,x:isize,y:isize)->Option<usize> { if x>=0&&y>=0 {self.index(x as usize,y as usize)} else {None} }
}
fn two_mut<T>(v:&mut [T],i:usize,j:usize)->(&mut T,&mut T) { assert!(i<j); let (a,b)=v.split_at_mut(j); (&mut a[i],&mut b[0]) }
