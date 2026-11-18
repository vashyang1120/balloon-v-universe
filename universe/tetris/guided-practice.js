/* Sequential guard around the ORIGINAL game's actions, not a second game engine. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BVGuidedPractice=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  return function(adapter,changed){
    var active=false,step=0,passed=false,depth=0,left=false,right=false;
    var permitted=[['left','right'],['rotate'],['down'],['drop']];
    function info(){return {active:active,step:step,passed:passed,complete:step===4};}
    function update(){if(changed)changed(info());}
    function reset(){adapter.cancelHeld();passed=false;left=right=false;adapter.reset(step);update();}
    function allows(name){return active&&step<4&&!passed&&permitted[step].indexOf(name)!==-1;}
    return {
      info:info,allows:allows,
      start:function(){active=true;step=0;reset();},
      retry:function(){if(!active||step===4)return false;reset();return true;},
      next:function(){if(!active||!passed||step===4)return false;step++;if(step<4)reset();else{passed=false;adapter.cancelHeld();update();}return true;},
      exit:function(){adapter.cancelHeld();active=false;passed=false;update();},
      invoke:function(name,original,self,args){
        if(!active||depth)return original.apply(self,args||[]);
        // The real down handler calls lock() on false. Consume blocked down as true.
        if(!allows(name))return name==='down'?true:undefined;
        var before=adapter.snapshot(),result;
        depth++;try{result=original.apply(self,args||[]);}finally{depth--;}
        var after=adapter.snapshot();
        if(step===0){if(name==='left'&&after.x<before.x)left=true;if(name==='right'&&after.x>before.x)right=true;passed=left&&right&&after.x===5;}
        else if(step===1)passed=after.cells.every(function(c){return c[0]===after.cells[0][0];});
        else if(step===2)passed=after.y>=8;
        else if(step===3)passed=after.lines===1;
        if(passed)adapter.cancelHeld();update();return result;
      }
    };
  };
});
