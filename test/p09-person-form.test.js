import test from 'node:test';
import assert from 'node:assert/strict';
import {personField,helperPlayerField} from '../site/p09-person-form.js';

test('P09B player context uses an escaped required name, private mobile and coach note',()=>{
  const name=personField('player','name','<A & B>');
  const phone=personField('player','phone','0400 "123"');
  const notes=personField('player','notes','injury detail <private>');
  assert.match(name,/name="name" value="&lt;A &amp; B&gt;" required/);
  assert.match(name,/autocapitalize="words"/);
  assert.match(phone,/type="tel" name="phone"/);
  assert.match(phone,/Coach only\. For messaging/);
  assert.match(notes,/&lt;private&gt;/);
  assert.doesNotMatch(notes,/<private>/);
  assert.doesNotMatch(name,/onchange=/);
});

test('P09B helper fields are distinct from player details and preserve linked-player context',()=>{
  const relation=personField('helper','relation',"Mia's mum");
  assert.match(relation,/name="relation"/);
  assert.match(relation,/Mia’s mum/);
  assert.match(relation,/Mia&#39;s mum/);
  assert.match(personField('helper','name','Erin'),/required/);
  assert.match(personField('helper','phone',''),/Coach only\. For asking them on WhatsApp/);
  assert.match(personField('helper','notes',''),/has a ute, first aid trained/);
  assert.throws(()=>personField('helper','email','X'),/Unsupported person form field/);
  assert.throws(()=>personField('player','relation','X'),/Unsupported person form field/);
});

test('P09B volunteer fields keep original validation boundaries without implying a verified registration',()=>{
  assert.match(personField('volunteer','name','Pat'),/required maxlength="120"/);
  assert.match(personField('volunteer','email','x@example.org'),/type="email" name="email" value="x@example.org" maxlength="254"/);
  assert.match(personField('volunteer','phone','0400'),/type="tel" name="phone" value="0400" maxlength="40"/);
  assert.doesNotMatch(personField('volunteer','email',''),/ required/);
  assert.throws(()=>personField('volunteer','notes','private'),/Unsupported person form field/);
  assert.throws(()=>personField('coach','name','Nobody'),/Unsupported person form field/);
});

test('P09B helper linked players use exact escaped local IDs and names with no global search',()=>{
  const html=helperPlayerField([{id:'p&1',name:'Ana <script>alert(1)</script>'},{id:'p2',name:'Mia'}],'p2');
  assert.match(html,/name="playerId"/);
  assert.match(html,/<option value="">None<\/option>/);
  assert.match(html,/value="p&amp;1"/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/value="p2" selected/);
  assert.equal((html.match(/ selected/g)||[]).length,1);
});
