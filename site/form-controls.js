// P09A: small shared, accessible form controls for the existing encrypted coach UI.
// These render markup only. No identity, storage, role or network side effects.
const esc = x => String(x ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nameOk = name => /^[A-Za-z][A-Za-z0-9-]*$/.test(String(name || ''));
const TYPES = new Set(['text','email','tel','number','date','url','search']);
function checkedName(name) {
  if (!nameOk(name)) throw new TypeError('Invalid form control name');
  return name;
}
function attr(name, value) {
  return value === undefined || value === null || value === ''
    ? '' : ' ' + name + '="' + esc(value) + '"';
}
export function inputField({name,label,value='',type='text',required=false,placeholder='',
  maxLength=null,min=null,max=null,autoCapitalize='',inputMode='',help=''}={}) {
  checkedName(name);
  if (!TYPES.has(type)) throw new TypeError('Unsupported input type');
  return '<label class="field-l"><span>'+esc(label)+'</span><input type="'+type+
    '" name="'+esc(name)+'" value="'+esc(value)+'"'+(required?' required':'')+
    attr('maxlength',maxLength)+attr('min',min)+attr('max',max)+
    attr('placeholder',placeholder)+attr('autocapitalize',autoCapitalize)+
    attr('inputmode',inputMode)+'>'+
    (help?'<small>'+esc(help)+'</small>':'')+'</label>';
}
export function selectField({name,label,options=[],selected='',required=false,help=''}={}) {
  checkedName(name);
  const choices=options.map(o => {
    const value=String(o.value ?? '');
    return '<option value="'+esc(value)+'"'+(value===String(selected)?' selected':'')+
      (o.disabled?' disabled':'')+'>'+esc(o.label)+'</option>';
  }).join('');
  return '<label class="field-l"><span>'+esc(label)+'</span><select name="'+esc(name)+
    '"'+(required?' required':'')+'>'+choices+'</select>'+
    (help?'<small>'+esc(help)+'</small>':'')+'</label>';
}
export function radioChoices({name,legend,options=[],selected=''}={}) {
  checkedName(name);
  if (!options.length || !options.some(o => String(o.value)===String(selected)))
    throw new TypeError('Radio choices need a valid selection');
  return '<fieldset class="crew-entry-choices"><legend>'+esc(legend)+'</legend>'+
    options.map(o => '<label class="opt"><input type="radio" name="'+esc(name)+
      '" value="'+esc(o.value)+'"'+(String(o.value)===String(selected)?' checked':'')+
      '><span><strong>'+esc(o.label)+'</strong><small>'+esc(o.description)+
      '</small></span></label>').join('')+'</fieldset>';
}
