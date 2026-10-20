import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveStyle, normStyle } from '../site/team-style.js';
import { normClub, clubForPlayers, validLogo } from '../site/model.js';

test('club colours are inherited unless a team explicitly overrides them',()=>{
  const club=normClub({id:'club1',name:'Harbour Club',style:{palette:'maroon'}});
  const team={clubId:'club1'};
  assert.deepEqual(effectiveStyle(team,club),{palette:'maroon'});
  const overridden={...team,style:{palette:'navyred'}};
  assert.deepEqual(effectiveStyle(overridden,club),{palette:'navyred'});
  delete overridden.style;
  assert.deepEqual(effectiveStyle(overridden,club),{palette:'maroon'});
  assert.equal(effectiveStyle({style:null},{name:'Classic Club'}),null);
  assert.deepEqual(normStyle({palette:'maroon'}),club.style);
});

test('validated public club branding appears in player copies without private officials',()=>{
  const png='data:image/png;base64,AA==';
  assert.equal(validLogo(png),true);
  const club=normClub({id:'club2',name:'Harbour',logo:png,style:{palette:'redwhite'},
    officials:[{role:'Registrar',name:'Private Name',email:'private@example.com'}],
    notes:'Private notes'});
  const copy=clubForPlayers(club);
  assert.equal(copy.logo,png);
  assert.deepEqual(copy.style,{palette:'redwhite'});
  assert.equal(JSON.stringify(copy).includes('private@example.com'),false);
  assert.equal(JSON.stringify(copy).includes('Private notes'),false);
  const bad=normClub({...club,style:{custom:{dark:'invalid',action:'#FFFFFF',accent:'#EEEEEE'}}});
  assert.equal(bad.style,undefined);
  assert.equal(clubForPlayers(bad).style,undefined);
});

test('multiple teams share the same club without copying logo bytes to each team',()=>{
  const club=normClub({id:'c',name:'Club',style:{palette:'bluegold'},logo:'data:image/png;base64,AA=='});
  const teams=[{team:{name:'U12',clubId:'c'}},{team:{name:'Open',clubId:'c'}}];
  assert.equal(teams.every(t=>t.team.style===undefined),true);
  assert.equal(teams.every(t=>effectiveStyle(t.team,club).palette==='bluegold'),true);
  assert.equal(clubForPlayers(club).logo,club.logo);
  assert.equal(teams.every(t=>!('logo' in t.team)),true);
});