pub fn render_cells(cells: &[u8], wetness: &[f32], heat: &[f32], colors: &[u8], width: usize, height: usize) -> Vec<u8> {
    let count = width.saturating_mul(height).min(cells.len());
    let mut pixels = vec![0_u8; count.saturating_mul(4)];
    for index in 0..count {
        let material = cells[index] as usize;
        let color_index = material.saturating_mul(3);
        let base = if color_index + 2 < colors.len() {
            [colors[color_index], colors[color_index + 1], colors[color_index + 2]]
        } else { [12_u8, 16_u8, 24_u8] };
        let wet = wetness.get(index).copied().unwrap_or(0.0).clamp(0.0, 1.0);
        let temperature = heat.get(index).copied().unwrap_or(0.0).max(0.0);
        let mut red = base[0] as f32;
        let mut green = base[1] as f32;
        let mut blue = base[2] as f32;
        if material == 1 && wet > 0.0 {
            let factor = 1.0 - wet * 0.38;
            red *= factor; green *= factor; blue *= factor;
        }
        if temperature > 0.0 && material != 5 {
            let factor = (temperature / 900.0).min(0.35);
            red += (255.0 - red) * factor;
            green += (100.0 - green) * factor;
            blue *= 1.0 - factor * 0.7;
        }
        let offset = index * 4;
        pixels[offset] = red.round().clamp(0.0, 255.0) as u8;
        pixels[offset + 1] = green.round().clamp(0.0, 255.0) as u8;
        pixels[offset + 2] = blue.round().clamp(0.0, 255.0) as u8;
        pixels[offset + 3] = 255;
    }
    pixels
}

/// Produces the base RGBA frame followed by a quarter-resolution glow buffer.
/// Keeping both passes here avoids a second per-pixel JavaScript traversal.
pub fn render_frame(cells:&[u8],wetness:&[f32],heat:&[f32],colors:&[u8],moving:&[u8],width:usize,height:usize)->Vec<u8>{
 let count=width.saturating_mul(height).min(cells.len());
 let bloom_w=width.saturating_add(3)/4;
 let bloom_h=height.saturating_add(3)/4;
 let frame_len=count.saturating_mul(4);
 let bloom_len=bloom_w.saturating_mul(bloom_h).saturating_mul(4);
 let mut out=vec![0u8;frame_len.saturating_add(bloom_len)];
 let mut glow_alpha=vec![0u8;bloom_w.saturating_mul(bloom_h)];
 for i in 0..count{
  let material=cells[i] as usize;
  let ci=material.saturating_mul(3);
  let base=if ci+2<colors.len(){[colors[ci],colors[ci+1],colors[ci+2]]}else{[12,16,24]};
  let wet=wetness.get(i).copied().unwrap_or(0.0).clamp(0.0,1.0);
  let temp=heat.get(i).copied().unwrap_or(0.0).max(0.0);
  let mut rgb=[base[0] as f32,base[1] as f32,base[2] as f32];
  if material==1&&wet>0.0{let f=1.0-wet*0.38;for c in &mut rgb{*c*=f;}}
  if temp>0.0&&material!=5{let f=(temp/900.0).min(0.35);rgb[0]+=(255.0-rgb[0])*f;rgb[1]+=(100.0-rgb[1])*f;rgb[2]*=1.0-f*0.7;}
  let p=i*4;
  if moving.get(i).copied().unwrap_or(0)!=0{rgb=[12.0,16.0,24.0];}
  out[p]=rgb[0].round().clamp(0.0,255.0) as u8;
  out[p+1]=rgb[1].round().clamp(0.0,255.0) as u8;
  out[p+2]=rgb[2].round().clamp(0.0,255.0) as u8;
  out[p+3]=255;
  let glow:u8=if material==5{210}else if material==11{190}else if temp>95.0&&material!=2&&material!=10&&material!=8&&material!=9{((temp-95.0)*0.22).round().clamp(0.0,150.0) as u8}else{0};
  if glow>0{
   let x=i%width.max(1);let y=i/width.max(1);let bi=(y/4)*bloom_w+x/4;
   if bi<glow_alpha.len()&&glow>glow_alpha[bi]{
    glow_alpha[bi]=glow;
    let bp=frame_len+bi*4;
    out[bp]=255;out[bp+1]=if material==11{65}else{135};out[bp+2]=if material==11{25}else{45};out[bp+3]=glow;
   }
  }
 }
 out
}

/// Renders and composites the glow pass into the base frame using a bilinear
/// quarter-resolution upscale and the same screen blend strength as the UI.
pub fn render_composited_frame(cells:&[u8],wetness:&[f32],heat:&[f32],colors:&[u8],moving:&[u8],width:usize,height:usize)->Vec<u8>{
 let mut combined=render_frame(cells,wetness,heat,colors,moving,width,height);
 let count=width.saturating_mul(height).min(cells.len());
 let frame_len=count.saturating_mul(4);
 let bw=width.saturating_add(3)/4;
 let bh=height.saturating_add(3)/4;
 if bw==0||bh==0||combined.len()<frame_len+bw.saturating_mul(bh).saturating_mul(4){combined.truncate(frame_len);return combined}
 let bloom=combined[frame_len..frame_len+bw*bh*4].to_vec();
 let sample=|x:f32,y:f32,c:usize|->f32{
  let x=x.clamp(0.0,(bw-1) as f32);let y=y.clamp(0.0,(bh-1) as f32);
  let x0=x.floor() as usize;let y0=y.floor() as usize;
  let x1=(x0+1).min(bw-1);let y1=(y0+1).min(bh-1);
  let fx=x-x0 as f32;let fy=y-y0 as f32;
  let at=|xx:usize,yy:usize|bloom[(yy*bw+xx)*4+c] as f32;
  let top=at(x0,y0)*(1.0-fx)+at(x1,y0)*fx;
  let bottom=at(x0,y1)*(1.0-fx)+at(x1,y1)*fx;
  top*(1.0-fy)+bottom*fy
 };
 for y in 0..height{
  for x in 0..width{
   let px=(x*4) as f32/4.0;
   let py=(y*4) as f32/4.0;
   let alpha=(sample(px,py,3)/255.0*0.58).clamp(0.0,1.0);
   if alpha<=0.0{continue}
   let p=(y*width+x)*4;
   for c in 0..3{
    let glow=sample(px,py,c).clamp(0.0,255.0);
    let base=combined[p+c] as f32;
    let screened=255.0-(255.0-base)*(255.0-glow)/255.0;
    combined[p+c]=(base+(screened-base)*alpha).round().clamp(0.0,255.0) as u8;
   }
  }
 }
 combined.truncate(frame_len);
 combined
}
