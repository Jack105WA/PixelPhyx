// Particle movement and material chemistry are owned by the Rust/WASM simulation.
export const materialState={
 wetness:new Float32Array(0),heat:new Float32Array(0),heatInputs:new Float32Array(0),
 fuel:new Float32Array(0),burn:new Float32Array(0),age:new Uint16Array(0),
 corrosion:new Float32Array(0),airHeat:new Float32Array(0),airNext:new Float32Array(0)
};
export function resetMaterialState(size){
 for(const key of Object.keys(materialState)){
  materialState[key]=key==='age'?new Uint16Array(size):new Float32Array(size);
 }
}
