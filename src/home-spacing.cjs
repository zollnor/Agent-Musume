'use strict';
// Pets that share a corner start side by side instead of on one spot: each pet, in list order, moves away from the
// corner until its body clears the pets placed before it. The body is the middle 240/640 of the window (HIT_BOX).
// Wrapped: pet windows load this as a classic script beside pet-appearances.cjs, which shares the global scope.
(()=>{
  const BODY=240/640,GAP=0.2;
  /** Effective home positions for the desktop pets, in the same order (renderer petIndex order). */
  function homePositions(pets){
    const placed=[];
    return pets.map(pet=>{
      const pos=pet.position??{},size=Number(pet.size)||0;
      let centre=pos.marginX+size/2; // from the corner's side of the screen to the body centre
      const near=placed.filter(q=>q.corner===pos.corner&&Math.abs(q.marginY-pos.marginY)<(q.size+size)*9/32).sort((a,b)=>a.centre-b.centre);
      for(const q of near){const need=(q.size+size)/2*(BODY+GAP);if(Math.abs(centre-q.centre)<need)centre=q.centre+need;}
      placed.push({corner:pos.corner,marginY:pos.marginY,size,centre});
      return {...pos,marginX:Math.round(centre-size/2)};
    });
  }
  const api={homePositions};
  if(typeof module!=='undefined')module.exports=api;
  else globalThis.DeskpetHome=api;
})();
