import * as THREE from 'three';

type ShadowMapState={autoUpdate:boolean;needsUpdate:boolean};

function forEachShadow(scene:THREE.Object3D,visit:(shadow:THREE.LightShadow)=>void){
  scene.traverse(object=>{
    if(object instanceof THREE.DirectionalLight||object instanceof THREE.SpotLight||object instanceof THREE.PointLight)visit(object.shadow);
  });
}

/** Camera movement does not change the depth maps of stationary lights/objects. */
export function cacheShadowMaps(shadowMap:ShadowMapState,scene:THREE.Object3D,cached:boolean){
  shadowMap.autoUpdate=!cached;
  forEachShadow(scene,shadow=>{shadow.autoUpdate=!cached;});
  invalidateShadowMaps(shadowMap,scene);
}

/** Both renderer and individual lights must be invalidated after scene changes. */
export function invalidateShadowMaps(shadowMap:ShadowMapState,scene:THREE.Object3D){
  shadowMap.needsUpdate=true;
  forEachShadow(scene,shadow=>{shadow.needsUpdate=true;});
}
