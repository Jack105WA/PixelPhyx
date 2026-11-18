/// Browser input coordinate mapping and brush rasterization.
pub fn map_pointer(client_x:f64,client_y:f64,left:f64,top:f64,css_width:f64,css_height:f64,width:u32,height:u32)->Vec<i32>{
 if !client_x.is_finite()||!client_y.is_finite()||!left.is_finite()||!top.is_finite()||!css_width.is_finite()||!css_height.is_finite()||css_width<=0.0||css_height<=0.0{return vec![-1,-1]}
 vec![((client_x-left)/css_width*width as f64).floor() as i32,((client_y-top)/css_height*height as f64).floor() as i32]
}
fn paint_disk(cells:&mut[u8],x:i32,y:i32,radius:i32,material:u8,width:i32,height:i32){
 let r=radius.clamp(0,64);let rr=r*r;
 for oy in -r..=r{for ox in -r..=r{if ox*ox+oy*oy>rr{continue}let px=x+ox;let py=y+oy;if px>=0&&py>=0&&px<width&&py<height{let i=py as usize*width as usize+px as usize;if i<cells.len(){cells[i]=material}}}}
}
pub fn paint_segment(cells:&mut[u8],x0:i32,y0:i32,x1:i32,y1:i32,radius:i32,material:u8,width:u32,height:u32){
 let w=width.min(i32::MAX as u32) as i32;let h=height.min(i32::MAX as u32) as i32;if w<=0||h<=0{return}
 let mut x=x0;let mut y=y0;let dx=(x1-x0).abs();let sx=if x0<x1{1}else{-1};let dy=-(y1-y0).abs();let sy=if y0<y1{1}else{-1};let mut err=dx+dy;
 let max_steps=(w as i64+h as i64)*2+1;let mut steps=0i64;
 loop{paint_disk(cells,x,y,radius,material,w,h);if x==x1&&y==y1{break}let e2=2*err;if e2>=dy{err+=dy;x+=sx}if e2<=dx{err+=dx;y+=sy}steps+=1;if steps>max_steps{break}}
}
