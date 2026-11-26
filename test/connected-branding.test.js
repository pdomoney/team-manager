import test from 'node:test';
import assert from 'node:assert/strict';
import {TEAM_STYLES,resolveStyle,contrast,STYLE_VARS} from '../site/team-style.js';
import {validConnectedStyle,validConnectedLogo,applyConnectedStyle} from '../site/connected-branding.js';
import {validateStage3D5} from '../src/stage3d5-management-contract.js';
import {validateOwnerAction} from '../worker/stage3d4-owner-api.js';
const req=(action,input={},role='team_coach')=>validateStage3D5({teamId:'team-a',role,action,input});
test('all 24 original palettes are valid with original contrast guarantees',()=>{
 assert.equal(TEAM_STYLES.length,24);
 for(const p of TEAM_STYLES){assert(validConnectedStyle({palette:p.id}));const r=resolveStyle({palette:p.id});assert(contrast(r.dark,'#FFFFFF')>=7);assert(contrast(r.action,r.actionInk)>=4.5);}
});
test('strict custom styles and inherited null are accepted, extra fields and unknown styles denied',()=>{
 assert(validConnectedStyle(null));assert(validConnectedStyle({custom:{dark:'#FFFFFF',action:'#FFFFFF',accent:'#FFFFFF'}}));
 for(const v of [{palette:'unknown'},{palette:'pitch',extra:true},{custom:{dark:'#bad',action:'#FFFFFF',accent:'#000000'}},{custom:{dark:'#FFFFFF',action:'#000000',accent:'#000000',extra:'x'}},undefined,[]])assert(!validConnectedStyle(v));
});
test('logo upload accepts only bounded raster data and correct MIME signature',()=>{
 assert(validConnectedLogo(''));
 assert(validConnectedLogo('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XK0AAAAASUVORK5CYII='));
 for(const v of ['https://example.test/logo.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,AAAA','data:image/jpeg;base64,iVBORw0KGgo=','data:image/png;base64,'+'a'.repeat(48000)])assert(!validConnectedLogo(v));
});
test('branding read includes authorised members, writes do not grant new roles',()=>{
 for(const role of ['team_coach','team_manager','team_player','team_assistant','team_volunteer','team_play_viewer'])assert(req('branding.read',{},role));
 for(const role of ['team_player','team_assistant','team_volunteer','team_play_viewer','platform_owner','club_admin']){
  assert.equal(req('branding.team.save',{style:null,expectedVersion:0},role),null);
 }
 assert(req('branding.club.save',{style:null,logo:'',resetOverrides:false,expectedVersion:0}));
 assert.equal(req('branding.club.save',{style:null,logo:'',resetOverrides:false,expectedVersion:0,clubRef:'other'}),null);
 assert.equal(req('branding.club.save',{style:null,logo:'',resetOverrides:'false',expectedVersion:0}),null);
});
test('founder branding delegation is explicit, no caller-supplied club or account accepted',()=>{
 for(const action of ['branding.status','branding.authorise','branding.revoke']){
  assert(validateOwnerAction({action}));assert.equal(validateOwnerAction({action,clubRef:'Other Club'}),null);
 }
});
test('effective original palette resets when team context is cleared',()=>{
 const values=new Map(),root={dataset:{},style:{setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)}};
 const meta={},doc={documentElement:root,querySelector:()=>meta};
 applyConnectedStyle(null,{palette:'redwhite'},doc);assert.equal(root.dataset.teamStyle,'redwhite');assert(values.has('--pitch'));
 applyConnectedStyle({palette:'blackwhite'},{palette:'redwhite'},doc);assert.equal(root.dataset.teamStyle,'blackwhite');
 applyConnectedStyle(null,null,doc);assert.equal(root.dataset.teamStyle,undefined);for(const k of STYLE_VARS)assert(!values.has(k));
});

test('moderation requests are scoped and validate raster, version and reason',()=>{
 const input={action:'branding.moderation.save',clubRef:'Club A',expectedVersion:1,style:{palette:'redwhite'},logo:'',resetOverrides:false,reason:'owner-correction'};
 assert(validateOwnerAction(input));assert(validateOwnerAction({action:'branding.catalogue'}));
 assert(validateOwnerAction({action:'branding.history',clubRef:'Club A'}));
 assert.equal(validateOwnerAction({...input,logo:'https://example.test/logo.svg'}),null);
 assert.equal(validateOwnerAction({...input,reason:'anything'}),null);
 assert.equal(validateOwnerAction({...input,expectedVersion:-1}),null);
 assert.equal(validateOwnerAction({...input,actor:'forged'}),null);
 assert.equal(validateOwnerAction({action:'branding.catalogue',clubRef:'Club A'}),null);
 assert.equal(req('settings.read',{},'team_play_viewer'),null);
});
