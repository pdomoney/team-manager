import test from 'node:test';
import assert from 'node:assert/strict';
import {validConnectedE5Play,authoredPlayImportCandidates} from '../site/cloud-e5-payload.js';
import {classifyE5Message,CHANNEL} from '../site/cloud-e5-host.js';
const play={id:'synthetic-step',name:'Step Out',sport:'Oztag',set:'oztag',
 players:{LM:[24,46],RM:[27,45]},moves:[{t:'pass',pts:[[24,46],[27,45]],moveId:'m-pass-1',linkVersion:1,actorLinks:{start:'player:LM',end:'player:RM'}}],
 phases:[{players:{RM:[27,45]},moves:[]}],steps:'Pass to the support runner'};
test('native connected payload gate preserves supported E5 play and timing',()=>{
 const before=JSON.stringify(play);assert(validConnectedE5Play(play));assert.equal(JSON.stringify(play),before);
 assert(validConnectedE5Play({...play,eventTimeline:{version:1,actors:[],events:[]}}));
});
test('unsafe SVG, nested private fields, stale timing and unknown role set are denied without rewriting',()=>{
 for(const x of [{...play,players:{'LM" onload="alert(1)':[24,46]}},{...play,moves:[{t:'pass" onload="alert(1)',pts:[[24,46],[27,45]]}]},
 {...play,players:{LM:['24',46]}},{...play,view:{x0:0,x1:0,y0:10,y1:20}},{...play,set:'custom'},
 {...play,phases:[{players:{LM:[24,46]},moves:[],phone:'private'}]},
 {...play,eventTimeline:{version:1,actors:[{actorId:'x',type:'attacker',phases:[{phaseIndex:3,slotKey:'LM'}]}],events:[]}},
 {...play,eventTimeline:{version:1,actors:[],events:[],private:'x'}}])assert.equal(validConnectedE5Play(x),false);
});
test('only mounted same-origin same-frame exact nonce editor can propose a detached save',()=>{
 const source={},origin='https://example.test',nonce='synthetic-nonce';
 const ctx={source,origin,nonce,mode:'edit',mounted:true,pending:false};
 const event={source,origin,data:{channel:CHANNEL,nonce,type:'save',play}};
 const msg=classifyE5Message(event,ctx);assert.deepEqual(msg,{type:'save',play});assert.notEqual(msg.play,play);
 for(const bad of [{...event,source:{}},{...event,origin:'https://other.test'},{...event,data:{...event.data,nonce:'other'}}])assert.equal(classifyE5Message(bad,ctx),null);
 for(const bad of [{...ctx,mode:'view'},{...ctx,mounted:false},{...ctx,pending:true}])assert.equal(classifyE5Message(event,bad),null);
});

test('self-contained custom role definition preserves original labels and rejects unresolved or unsafe definitions',()=>{
 const custom={...play,set:'custom-role-set',setDef:{name:'Custom',labels:[{code:'A1',name:'Left support'},{code:'A2',name:'Right support'}],slots:{LM:'A1',RM:'A2'}},who:{LM:'A1',RM:'A2'}};
 const before=JSON.stringify(custom);
 assert.equal(validConnectedE5Play(custom),true);
 assert.equal(JSON.stringify(custom),before);
 for(const bad of [{...custom,setDef:undefined},{...custom,who:{LM:'X'}},
 {...custom,setDef:{...custom.setDef,labels:[{code:'A1',name:'constructor'}]}},
 {...custom,setDef:{...custom.setDef,slots:{LM:'X'}}},
 {...custom,setDef:{...custom.setDef,labels:[...custom.setDef.labels,custom.setDef.labels[0]]}},
 {...custom,set:'oztag'}])assert.equal(validConnectedE5Play(bad),false);
});

test('original library exports expose one independently reviewed candidate per source play',()=>{
 const custom={...play,set:'custom-role',setDef:{name:'Roles',labels:[{code:'A',name:'Support'}]},who:{LM:'A'}};
 const exported={format:'team-manager-library',version:1,exportedAt:'2026-11-27',library:{plays:[{...custom,at:'2026-11-27',libraryOrigin:{teamId:'private-team'}},{...play,set:'missing'}]}};
 const before=JSON.stringify(exported),result=authoredPlayImportCandidates(exported);
 assert.equal(result.length,2);assert.deepEqual(result[0].play,custom);assert.equal(result[1].play,null);
 assert.equal(JSON.stringify(exported),before);assert.deepEqual(authoredPlayImportCandidates({schema:4,plays:[play]}),[]);
});
