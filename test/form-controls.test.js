import test from 'node:test';
import assert from 'node:assert/strict';
import {inputField,selectField,radioChoices} from '../site/form-controls.js';

test('P09A input controls escape untrusted coach-entered values and retain standard semantics',()=>{
  const field=inputField({name:'phone',label:'Contact & mobile',value:'"><img src=x onerror=alert(1)>',
    type:'tel',required:true,maxLength:40,placeholder:'04xx xxx xxx',help:'Coach <only>'});
  assert.match(field,/type="tel" name="phone"/);
  assert.match(field,/required maxlength="40"/);
  assert.match(field,/Contact &amp; mobile/);
  assert.match(field,/Coach &lt;only&gt;/);
  assert.doesNotMatch(field,/<img/);
  assert.doesNotMatch(field,/onerror=/);
  assert.match(field,/&quot;&gt;&lt;img/);
});

test('P09A manual volunteer year preserves number limits, email remains required only when configured',()=>{
  const joined=inputField({name:'joined',label:'Joined',type:'number',min:1900,max:2026});
  const recipient=inputField({name:'email',label:'Recipient email',type:'email',required:true,maxLength:254});
  const optional=inputField({name:'email',label:'Email (optional)',type:'email',maxLength:254});
  assert.match(joined,/min="1900" max="2026"/);
  assert.match(recipient,/type="email" name="email" value="" required maxlength="254"/);
  assert.doesNotMatch(optional,/ required/);
});

test('P09A select keeps one explicit option selected and escapes workspace names',()=>{
  const markup=selectField({name:'clubId',label:'Club',
    options:[{value:'one',label:'St George Oztag'},{value:'two',label:'<Bad> & unsafe'}],
    selected:'two',help:'Local workspace only'});
  assert.match(markup,/value="two" selected/);
  assert.match(markup,/&lt;Bad&gt; &amp; unsafe/);
  assert.match(markup,/Local workspace only/);
  assert.equal((markup.match(/ selected/g)||[]).length,1);
  assert.equal((selectField({name:'teamId',label:'Team',options:[{value:'',label:'No team assignment yet'}]})
    .match(/<option value="">/g)||[]).length,1);
});

test('P09A radio group has a fieldset, one checked choice, native radio semantics and escaped text',()=>{
  const html=radioChoices({name:'method',legend:'How to add?',
    selected:'manual',options:[
      {value:'existing',label:'Existing volunteer',description:'Reuse person'},
      {value:'invite',label:'Email invitation',description:'No account'},
      {value:'manual',label:'Add manually',description:'Enter <details> safely'}]});
  assert.match(html,/<fieldset class="crew-entry-choices"><legend>How to add\?<\/legend>/);
  assert.equal((html.match(/type="radio"/g)||[]).length,3);
  assert.equal((html.match(/ checked/g)||[]).length,1);
  assert.match(html,/value="manual" checked/);
  assert.match(html,/&lt;details&gt;/);
});

test('P09A rejects unsupported control types and invalid field names',()=>{
  assert.throws(()=>inputField({name:'method" onclick',label:'X'}),/Invalid form control name/);
  assert.throws(()=>selectField({name:'',label:'X'}),/Invalid form control name/);
  assert.throws(()=>inputField({name:'roles',type:'password',label:'X'}),/Unsupported input type/);
  assert.throws(()=>radioChoices({name:'method',legend:'X',selected:'auto',options:[
    {value:'manual',label:'Manual',description:'D'}]}),/valid selection/);
  assert.throws(()=>radioChoices({name:'method',legend:'X',selected:'manual'}),/valid selection/);
});
