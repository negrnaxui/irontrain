class IronWastesPerformanceGovernor {
  constructor(renderer) {
    this.renderer=renderer;
    this.nativeDpr=Math.max(.75,Math.min(3,window.devicePixelRatio||1));
    this.mobile=matchMedia?.('(pointer: coarse)')?.matches || innerWidth<900;
    this.maxPixelRatio=Math.min(this.nativeDpr,this.mobile?1.0:1.30);
    this.minPixelRatio=this.mobile?.72:.78;
    this.pixelRatio=Math.min(this.maxPixelRatio,this.mobile?.90:1.15);
    this.renderer.setPixelRatio(this.pixelRatio);

    this.sampleTime=0;this.frames=0;this.fps=60;this.stableHigh=0;this.quality='MEDIUM';
    this.frameIndex=0;this.accumulators=new Map();
    // Updating the main shadow maps at 20-30 Hz is visually smooth because the Sun/Moon
    // and train move continuously, while it removes a very expensive extra render pass
    // from many display frames.
    this.renderer.shadowMap.autoUpdate=false;
    this.renderer.shadowMap.needsUpdate=true;
    this.shadowStride=2;
  }
  update(dt) {
    this.frameIndex++;
    const d=Math.max(0,Math.min(.1,dt||0));
    this.sampleTime+=d;this.frames++;
    if(this.frameIndex%this.shadowStride===0)this.renderer.shadowMap.needsUpdate=true;
    if(this.sampleTime<2.0)return;
    this.fps=this.frames/Math.max(.001,this.sampleTime);
    this.sampleTime=0;this.frames=0;

    let next=this.pixelRatio;
    if(this.fps<32){next-=.15;this.stableHigh=0;this.quality='LOW';this.shadowStride=3;}
    else if(this.fps<44){next-=.09;this.stableHigh=0;this.quality='LOW';this.shadowStride=3;}
    else if(this.fps<52){this.stableHigh=0;this.quality='MEDIUM';this.shadowStride=2;}
    else if(this.fps>58){this.stableHigh++;this.quality='HIGH';this.shadowStride=2;if(this.stableHigh>=4){next+=.05;this.stableHigh=0;}}
    else {this.stableHigh=0;this.quality='MEDIUM';this.shadowStride=2;}
    next=THREE.MathUtils.clamp(next,this.minPixelRatio,this.maxPixelRatio);
    if(Math.abs(next-this.pixelRatio)>=.045){this.pixelRatio=next;this.renderer.setPixelRatio(this.pixelRatio);this.renderer.setSize(innerWidth,innerHeight,false);}
    const info=this.renderer.info||{};window.__IRON_WASTES_PERFORMANCE__={fps:Math.round(this.fps),pixelRatio:Number(this.pixelRatio.toFixed(2)),quality:this.quality,shadowFps:Math.round(60/this.shadowStride),drawCalls:info.render?.calls||0,triangles:info.render?.triangles||0,geometries:info.memory?.geometries||0,textures:info.memory?.textures||0};
  }
  consume(name,dt,seconds) {
    if(!(dt>0))return 0;
    const mul=this.quality==='LOW'?1.35:1;
    const threshold=seconds*mul;
    const value=(this.accumulators.get(name)||0)+dt;
    if(value+1e-6<threshold){this.accumulators.set(name,value);return 0;}
    this.accumulators.set(name,0);
    return Math.min(.12,value);
  }
  detailDistance(base) { return this.quality==='LOW'?base*.82:(this.quality==='MEDIUM'?base*.92:base); }
}
window.IronWastesPerformanceGovernor=IronWastesPerformanceGovernor;
