// Material chemistry kernels. This module owns reaction state mutation for WASM.
pub fn step_acid(
    cells: &mut [u8],
    corrosion: &mut [f32],
    burn: &mut [f32],
    heat: &mut [f32],
    wetness: &mut [f32],
    fuel: &mut [f32],
    age: &mut [u16],
    width: usize,
    height: usize,
) {
    let len = width.saturating_mul(height)
        .min(cells.len()).min(corrosion.len()).min(burn.len())
        .min(heat.len()).min(wetness.len()).min(fuel.len()).min(age.len());
    if width == 0 || height == 0 { return; }

    for i in 0..len {
        if cells[i] != 7 { continue; } // Acid
        let x = i % width;
        let y = i / width;
        if age[i] > 1800 {
            cells[i] = 0;
            continue;
        }

        let neighbors = [
            if y > 0 { Some(i - width) } else { None },
            if x > 0 { Some(i - 1) } else { None },
            if x + 1 < width { Some(i + 1) } else { None },
            if y + 1 < height { Some(i + width) } else { None },
        ];

        for ni in neighbors.into_iter().flatten() {
            let resistance = match cells[ni] {
                1 => 18.0,  // Sand
                13 => 24.0, // Plant
                4 => 42.0,  // Wood
                3 => 95.0,  // Stone
                15 => 125.0,// Glass
                10 => 10.0, // Ice
                14 => 8.0,  // Salt
                _ => continue,
            };
            corrosion[ni] += if cells[ni] == 1 || cells[ni] == 14 { 1.2 } else { 0.65 };
            if corrosion[ni] >= resistance {
                cells[ni] = 0;
                corrosion[ni] = 0.0;
                burn[ni] = 0.0;
                heat[ni] = 0.0;
                wetness[ni] = 0.0;
                fuel[ni] = 0.0;
                age[ni] = 0;
            }
        }
    }

    // State arrays belonging to erased cells must not retain stale chemistry.
    for i in 0..len {
        if cells[i] == 0 {
            corrosion[i] = 0.0;
            burn[i] = 0.0;
            heat[i] = 0.0;
            wetness[i] = 0.0;
            fuel[i] = 0.0;
            age[i] = 0;
        }
    }
}

fn random01(index: usize, age: u16, salt: u32) -> f32 {
    let mut x = (index as u32).wrapping_mul(0x9E37_79B9)
        ^ (age as u32).wrapping_mul(0x85EB_CA6B) ^ salt;
    x ^= x >> 16;
    x = x.wrapping_mul(0x7FEB_352D);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846C_A68B);
    x ^= x >> 16;
    (x as f64 / u32::MAX as f64) as f32
}

pub fn step_phase_changes(cells: &mut [u8], age: &[u16], ambient: f32, width: usize, height: usize) {
    let len = width.saturating_mul(height).min(cells.len()).min(age.len());
    if width == 0 || height == 0 { return; }
    let freeze = (-ambient / 9000.0).clamp(0.0, 0.12);
    let melt = (ambient / 14000.0).clamp(0.0, 0.10);
    let evaporation = ((ambient - 100.0) / 18000.0).clamp(0.0, 0.05);
    for i in 0..len {
        match cells[i] {
            2 if random01(i, age[i], 0xA341_316C) < freeze => cells[i] = 10,
            10 if random01(i, age[i], 0xC801_3EA4) < melt => cells[i] = 2,
            2 if random01(i, age[i], 0xAD90_777D) < evaporation => cells[i] = 8,
            _ => {}
        }
    }
}
