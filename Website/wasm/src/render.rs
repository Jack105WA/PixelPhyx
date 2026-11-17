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
