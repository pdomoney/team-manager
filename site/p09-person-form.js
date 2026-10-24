// P09B: role-contextual person fields share P09A's escaped native inputs.
// Render-only; never merges identities, grants access or changes stored data.
import {inputField,selectField} from './form-controls.js';

const FIELDS=Object.freeze({
  player:Object.freeze({
    name: {label:'Name',required:true,autoCapitalize:'words'},
    phone:{label:'Mobile',type:'tel',placeholder:'04xx xxx xxx',
      help:'Coach only. For messaging them directly on WhatsApp.'},
    notes:{label:'Notes',placeholder:'Coach only, e.g. works Thursdays'}
  }),
  helper:Object.freeze({
    name:{label:'Name',required:true,autoCapitalize:'words'},
    phone:{label:'Mobile',type:'tel',placeholder:'04xx xxx xxx',
      help:'Coach only. For asking them on WhatsApp.'},
    relation:{label:'Who they are',placeholder:'e.g. Mia’s mum'},
    notes:{label:'Notes',placeholder:'e.g. has a ute, first aid trained'}
  }),
  volunteer:Object.freeze({
    name:{label:'Full name',required:true,maxLength:120},
    email:{label:'Email (optional)',type:'email',maxLength:254},
    phone:{label:'Mobile / contact number (optional)',type:'tel',maxLength:40}
  })
});
export function personField(role, name, value='') {
  const field=FIELDS[role]?.[name];
  if (!field) throw new TypeError('Unsupported person form field/context');
  return inputField({name,value,...field});
}
export function helperPlayerField(players=[],selected='') {
  const options=[{value:'',label:'None'},...players.map(p=>({
    value:String(p?.id ?? ''), label:String(p?.name ?? '')
  }))];
  return selectField({name:'playerId',label:'Linked player',options,selected});
}
