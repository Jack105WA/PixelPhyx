// Deterministic simulation tick orchestration shared by browser and worker runtimes.
// Each callback owns one stage; this module fixes the authoritative order in one place.
export function runSimulationTick(stages) {
  stages.beginTick();
  stages.stepLife();
  stages.applyLeafblowerImpulses();
  stages.stepRopes();
  const moveTriples = stages.advanceParticlePhysics();
  stages.recordParticleMoves(moveTriples);
  stages.stepCustomMaterials();
  stages.emitMaterialEffects();
  const detonations = stages.stepChemistry();
  if (detonations) stages.onDetonations?.(detonations);
  stages.stepVisualParticles();
  return { moveTriples, detonations };
}
