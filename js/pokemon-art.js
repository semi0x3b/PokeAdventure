// 외부 원본은 브라우저 메모리에서만 첫 프레임을 잘라 쓴다. 원본 파일을 앱에 포함하지 않는다.
(function (root) {
  'use strict';
  const model = /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/master\/sprites\/pokemon\/versions\/generation-viii\/brilliant-diamond-shining-pearl\/(back\/)?(\d+)\.webp$/;
  const artwork = /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/master\/sprites\/pokemon\/other\/official-artwork\/(\d+)\.png$/;
  function geometry(width, height, bounds, bodyX = null) {
    const left = Math.max(0, bounds[0] - 2), top = Math.max(0, bounds[1] - 2);
    const right = Math.min(width, bounds[2] + 2), bottom = Math.min(height, bounds[3] + 2);
    const cropWidth = right - left, cropHeight = bottom - top;
    if (bodyX === null) return { left, top, cropWidth, cropHeight, width:cropWidth, height:cropHeight, offset:0 };
    const body = bodyX - left, half = Math.ceil(Math.max(body, cropWidth - body));
    return { left, top, cropWidth, cropHeight, width:half*2, height:cropHeight, offset:Math.round(half-body) };
  }
  root.PokemonArt = Object.freeze({ geometry });
  if (!root.document?.addEventListener || !root.MutationObserver) return;
  const cache = new Map();
  function sourceKind(url) {
    const match = url.match(model);
    if (match) return { id:Number(match[2]), back:Boolean(match[1]), model:true };
    const art = url.match(artwork);
    return art ? {id:Number(art[1]),model:false} : null;
  }
  function prepare(node) {
    if (node.nodeType !== 1) return;
    const images = node.tagName === 'IMG' ? [node] : [...node.querySelectorAll('img')];
    for (const image of images) if (sourceKind(image.src) && image.crossOrigin !== 'anonymous') image.crossOrigin = 'anonymous';
  }
  async function raster(image, kind) {
    const w=image.naturalWidth,h=image.naturalHeight;
    if (!w || !h || w*h>4096*4096) throw Error('그림 크기 확인 실패');
    const sample=document.createElement('canvas');sample.width=w;sample.height=h;
    const context=sample.getContext('2d',{willReadFrequently:true});
    context.drawImage(image,0,0);
    const rgba=context.getImageData(0,0,w,h).data;
    let left=w,top=h,right=0,bottom=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(rgba[(y*w+x)*4+3]>10){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
    if(right<=left||bottom<=top)throw Error('빈 그림');
    // 원본 512px 좌표에서 머리·배·발의 몸통 축. 긴 꼬리도 자르지 않고 투명 여백으로 맞춘다.
    const body=kind.id===25?(kind.model?(kind.back?364:162):w*156/360):null;
    const g=geometry(w,h,[left,top,right,bottom],body);
    const canvas=document.createElement('canvas');canvas.width=g.width;canvas.height=g.height;
    canvas.getContext('2d').drawImage(sample,g.left,g.top,g.cropWidth,g.cropHeight,g.offset,0,g.cropWidth,g.cropHeight);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('그림 준비 실패');
    return URL.createObjectURL(blob);
  }
  document.addEventListener('load',event=>{
    const image=event.target;
    if(image?.tagName!=='IMG')return;
    const source=image.src,kind=sourceKind(source);
    if(!kind)return;
    if(!cache.has(source))cache.set(source,raster(image,kind).catch(()=>null));
    void cache.get(source).then(url=>{
      if(url&&image.isConnected&&image.src===source){image.dataset.assetSource=source;image.removeAttribute('srcset');image.removeAttribute('sizes');image.src=url;}
    });
    if(cache.size>60){const key=cache.keys().next().value;const old=cache.get(key);cache.delete(key);void old.then(url=>{if(url)URL.revokeObjectURL(url);});}
  },true);
  new MutationObserver(changes=>{for(const change of changes){if(change.type==='attributes')prepare(change.target);else for(const node of change.addedNodes)prepare(node);}}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  prepare(document.documentElement);
})(typeof window==='undefined'?globalThis:window);
