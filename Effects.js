class IronWastesEffects {
  constructor(renderer) {
    this.renderer = renderer;
    this.textures = {};
    this.materials = {};
    this.buildTextures();
    this.buildMaterials();
    this.buildEnvironmentTexture();
  }

  seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  noiseTexture(name, base, variance = 28, scratches = 28, seed = 1, size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const rnd = this.seeded(seed);
    const br = (base >> 16) & 255, bg = (base >> 8) & 255, bb = base & 255;
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rnd() - .5) * variance;
      img.data[i] = THREE.MathUtils.clamp(br + n, 0, 255);
      img.data[i+1] = THREE.MathUtils.clamp(bg + n * .9, 0, 255);
      img.data[i+2] = THREE.MathUtils.clamp(bb + n * .7, 0, 255);
      img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.globalAlpha = .22;
    for (let i=0; i<scratches; i++) {
      const x = rnd()*size, y = rnd()*size;
      ctx.strokeStyle = rnd()>.5 ? '#d6c3a0' : '#12181b';
      ctx.lineWidth = .35 + rnd()*1.15;
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.lineTo(x + (rnd()-.5)*40, y + (rnd()-.5)*5);
      ctx.stroke();
    }
    ctx.globalAlpha = .18;
    for (let i=0;i<18;i++) {
      const x=rnd()*size, y=rnd()*size, r=2+rnd()*10;
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,'rgba(35,18,8,.85)'); g.addColorStop(1,'rgba(35,18,8,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4,4);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = Math.min(4, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    this.textures[name] = tex;
    return tex;
  }

  radialTexture(name, inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,.35)') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32,32,1,32,32,31);
    g.addColorStop(0,inner); g.addColorStop(.28,mid); g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,64,64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    this.textures[name] = tex;
    return tex;
  }

  buildTextures() {
    this.noiseTexture('rust', 0x704630, 46, 34, 11);
    this.noiseTexture('iron', 0x30383b, 30, 36, 23);
    this.noiseTexture('brass', 0x98713a, 36, 30, 37);
    this.noiseTexture('copper', 0x70462f, 38, 34, 41);
    this.noiseTexture('patina', 0x3c6862, 42, 38, 47);
    this.noiseTexture('wood', 0x573921, 34, 54, 53);
    this.noiseTexture('ground', 0x2b302d, 38, 16, 67);
    this.noiseTexture('ballast', 0x454541, 44, 14, 79);
    this.noiseTexture('soot', 0x202527, 24, 20, 97);
    this.noiseTexture('concrete', 0x595955, 26, 20, 101);
    this.radialTexture('smoke', 'rgba(245,245,235,.92)','rgba(205,210,205,.30)');
    this.radialTexture('spark', 'rgba(255,245,180,1)','rgba(255,115,18,.55)');

    // Repetition is tuned per material instead of stretching one 128px texture over the whole route.
    this.textures.ground.repeat.set(24,260);
    this.textures.ballast.repeat.set(7,220);
    this.textures.wood.repeat.set(3,3);
    this.textures.iron.repeat.set(5,5);
    this.textures.rust.repeat.set(4,4);
    this.textures.brass.repeat.set(3,3);
    this.textures.copper.repeat.set(3,3);
    this.textures.patina.repeat.set(3,3);
    this.textures.soot.repeat.set(5,5);
    this.textures.concrete.repeat.set(5,8);
  }

  buildEnvironmentTexture() {
    // Cheap static industrial reflection source. It is intentionally low resolution and
    // never rendered by a real-time CubeCamera, so it adds metal response almost for free.
    const faceColors=[0x75838a,0x50585c,0x8a765f,0x30383e,0x66737b,0x4b4f4d];
    const faces=faceColors.map((hex,i)=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=24;
      const ctx=canvas.getContext('2d');
      const c=new THREE.Color(hex);const r=Math.round(c.r*255),g=Math.round(c.g*255),b=Math.round(c.b*255);
      const grad=ctx.createLinearGradient(0,0,0,24);
      grad.addColorStop(0,`rgb(${Math.min(255,r+18)},${Math.min(255,g+18)},${Math.min(255,b+18)})`);
      grad.addColorStop(1,`rgb(${Math.max(0,r-18)},${Math.max(0,g-18)},${Math.max(0,b-18)})`);
      ctx.fillStyle=grad;ctx.fillRect(0,0,24,24);
      return canvas;
    });
    const tex=new THREE.CubeTexture(faces);tex.encoding=THREE.sRGBEncoding;tex.needsUpdate=true;
    this.environmentTexture=tex;
    for(const key of ['rust','darkIron','soot','brass','copper','patina','black','debris']){const m=this.materials[key];if(m){m.envMap=tex;m.needsUpdate=true;}}
  }

  buildMaterials() {
    const M = this.materials;
    M.rust = new THREE.MeshStandardMaterial({ map:this.textures.rust, color:0xa97454, roughness:.78, metalness:.72, envMapIntensity:.48 });
    M.darkIron = new THREE.MeshStandardMaterial({ map:this.textures.iron, color:0x6b7476, roughness:.56, metalness:.90, envMapIntensity:.58 });
    M.soot = new THREE.MeshStandardMaterial({ map:this.textures.soot, color:0x4d5253, roughness:.80, metalness:.68, envMapIntensity:.38 });
    M.brass = new THREE.MeshStandardMaterial({ map:this.textures.brass, color:0xc19b59, roughness:.39, metalness:.92, envMapIntensity:.78 });
    M.copper = new THREE.MeshStandardMaterial({ map:this.textures.copper, color:0xa96d49, roughness:.45, metalness:.86, envMapIntensity:.70 });
    M.patina = new THREE.MeshStandardMaterial({ map:this.textures.patina, color:0x688b84, roughness:.66, metalness:.73, envMapIntensity:.55 });
    M.wood = new THREE.MeshStandardMaterial({ map:this.textures.wood, color:0x805a3d, roughness:.93, metalness:.03 });
    M.ground = new THREE.MeshStandardMaterial({ map:this.textures.ground, color:0x69706a, roughness:1, metalness:0 });
    M.ballast = new THREE.MeshStandardMaterial({ map:this.textures.ballast, color:0x777773, roughness:.98, metalness:.02 });
    M.concrete = new THREE.MeshStandardMaterial({ map:this.textures.concrete, color:0x8a8981, roughness:.96, metalness:.04 });
    M.glassDark = new THREE.MeshStandardMaterial({ color:0x27343c, roughness:.18, metalness:.15, transparent:true, opacity:.66 });
    M.black = new THREE.MeshStandardMaterial({ color:0x15191a, roughness:.73, metalness:.88 });
    M.debris = new THREE.MeshStandardMaterial({ color:0x4b4037, roughness:.86, metalness:.48 });
  }
}

window.IronWastesEffects = IronWastesEffects;
