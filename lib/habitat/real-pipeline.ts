import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

export type RealQuality='balanced'|'high';
/** Contact shading and photographic tone mapping, exclusively on the WebGL path. */
export class RealPipeline{
  private composer:EffectComposer;private ao:GTAOPass;private bloom:UnrealBloomPass;private fxaa:ShaderPass;private passes:{dispose:()=>void}[];
  constructor(private renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera){
    this.composer=new EffectComposer(renderer);const render=new RenderPass(scene,camera);
    this.ao=new GTAOPass(scene,camera);this.ao.output=GTAOPass.OUTPUT.Default;this.ao.blendIntensity=.65;this.ao.updateGtaoMaterial({radius:.45,thickness:.12,distanceFallOff:1,samples:8});this.ao.updatePdMaterial({samples:8,radius:4});
    this.bloom=new UnrealBloomPass(new THREE.Vector2(512,512),.12,.45,1.2);const output=new OutputPass();this.fxaa=new ShaderPass(FXAAShader);
    this.passes=[render,this.ao,this.bloom,output,this.fxaa];for(const pass of [render,this.ao,this.bloom,output,this.fxaa])this.composer.addPass(pass);
  }
  resize(width:number,height:number,quality:RealQuality){
    const ratio=this.renderer.getPixelRatio();this.composer.setPixelRatio(ratio);this.composer.setSize(width,height);
    this.ao.enabled=this.bloom.enabled=quality==='high';this.ao.setSize(Math.max(1,Math.round(width*ratio*.65)),Math.max(1,Math.round(height*ratio*.65)));
    this.fxaa.uniforms.resolution.value.set(1/(width*ratio),1/(height*ratio));
  }
  render(){this.composer.render();}
  dispose(){for(const pass of this.passes)pass.dispose();this.ao.gtaoMaterial.dispose();this.ao.blendMaterial.dispose();this.composer.dispose();}
}
