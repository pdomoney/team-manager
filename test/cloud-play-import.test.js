import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPlayImport} from '../site/cloud-play-import.js';
const p={id:'step',name:'Step',players:{LM:[24,46]},moves:[]};
test('legacy library selection preserves geometry and resolves exact custom set',()=>{
 const file={format:'team-manager-library',version:1,library:{plays:[{...p,set:'custom',who:{LM:'A1'},libraryOrigin:{teamId:'private'},rev:2}],playerSets:[{id:'custom',name:'Custom',labels:[{code:'A1',name:'Support'}]}]}};
 const before=JSON.stringify(file),r=inspectPlayImport(file);
 assert.equal(r.ok,true);assert.equal(r.rows.length,1);assert.equal(r.rows[0].play.setDef.labels[0].code,'A1');
 assert.deepEqual(r.rows[0].play.players,p.players);assert.equal('libraryOrigin' in r.rows[0].play,false);
 assert.equal(JSON.stringify(file),before);
 file.library.playerSets.push(file.library.playerSets[0]);
 assert.equal(inspectPlayImport(file).omitted[0].reason,'missing-or-ambiguous-role-set');
});
test('ambiguous records are held; backup not accepted',()=>{
 assert.equal(inspectPlayImport({schema:4,plays:[p]}).ok,false);
 const r=inspectPlayImport({format:'team-manager-library',version:1,library:{plays:[p,{...p,id:'bad',phone:'secret'},p,{...p,id:'unique'}]}});
 assert.equal(r.rows.length,1);assert.equal(r.omitted.length,3);
});
