'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { makeModel, disposeObject } from '@/lib/habitat/models';
import type { Entity } from '@/lib/habitat/domain';

export default function ProductPreview({item}:{item:Entity}){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!host.current)return;const el=host.current,scene=new THREE.Scene();scene.background=new THREE.Color('#edf2ee');
    let renderer:THREE.WebGLRenderer|SVGRenderer;try{renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));}catch{renderer=new SVGRenderer();renderer.setQuality('high');}
    el.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','Prévia proporcional do produto em 3D');
    const camera=new THREE.PerspectiveCamera(38,1,.01,200),model=makeModel(item,[]);scene.add(model,new THREE.HemisphereLight('#ffffff','#77958a',2.5));
    const light=new THREE.DirectionalLight('#ffffff',2.4);light.position.set(3,5,4);scene.add(light);
    const max=Math.max(item.w,item.h,item.d),target=new THREE.Vector3(0,item.h/2,0);camera.position.copy(target).add(new THREE.Vector3(max*1.7,max*.9,max*2.2));
    const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(target);controls.enablePan=false;controls.minDistance=max*.8;controls.maxDistance=max*7;controls.update();
    const render=()=>renderer.render(scene,camera);controls.addEventListener('change',render);
    const resize=()=>{const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();};
    const observer=new ResizeObserver(resize);observer.observe(el);resize();
    return()=>{observer.disconnect();controls.dispose();disposeObject(model);if(renderer instanceof THREE.WebGLRenderer)renderer.dispose();renderer.domElement.remove();};
  },[item]);
  return <div className="product-3d-preview" ref={host}/>;
}
