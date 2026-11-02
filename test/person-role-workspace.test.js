import test from 'node:test';import assert from 'node:assert/strict';
import {personWorkspace} from '../site/person-role-workspace.js';
test('coach sees own teams and coach navigation, not manager tools',()=>{
 const p=personWorkspace('qa-07');assert.equal(p.role,'team_coach');assert.deepEqual(p.sections,['Dashboard','Squad','Training','Matches','Plays','Seasons']);assert.equal(p.teams.length,1);assert.equal(p.allTeamCount,2);
});
test('manager works across clubs but only in exact selected team',()=>{
 const p=personWorkspace('qa-09');assert.equal(p.role,'team_manager');assert.equal(p.allTeamCount,3);assert.equal(p.teams.length,1);
 const next=personWorkspace('qa-09','grant:team_manager:team:qa-rangers-16');assert.equal(next.teams[0].clubId,'qa-rangers');assert.ok(next.sections.includes('Match-day staff'));
});
test('one person has independent coach, manager, player and club scopes',()=>{
 const id='qa-18';const coach=personWorkspace(id,'grant:team_coach:team:qa-rangers-16');const manager=personWorkspace(id,'grant:team_manager:team:qa-stars-women');const player=personWorkspace(id,'membership:player:team:qa-comets-mixed');
 assert.equal(coach.role,'team_coach');assert.equal(manager.role,'team_manager');assert.equal(player.role,'player');assert.equal(player.access,false);assert.deepEqual(player.teams.map(t=>t.id),['qa-comets-mixed']);assert.ok(!player.sections.includes('People'));
});
test('multi-sport player retains two separate teams',()=>{
 const p=personWorkspace('qa-14');assert.equal(p.allTeamCount,2);assert.deepEqual(p.sports,['Oztag','Touch']);assert.equal(p.access,false);assert.ok(p.sections.includes('My teams'));
});
test('revoked and pending roles never create a workspace',()=>{
 assert.equal(personWorkspace('qa-19').access,false);assert.equal(personWorkspace('qa-20').access,false);assert.deepEqual(personWorkspace('qa-19').sections,['No access']);
});
