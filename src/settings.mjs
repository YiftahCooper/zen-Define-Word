import {providers} from './providers/registry.mjs';
import {DEFAULT_BINDING,validateBinding,bindingLabel,findConflict} from './shortcut.mjs';
export const PREF='extension.define-word.';
export function readSettings(prefs){
  const english=prefs.getStringPref(`${PREF}english`,'wiktionary-en'),hebrew=prefs.getStringPref(`${PREF}hebrew`,'wiktionary-he');
  let shortcut;try{const raw=prefs.getStringPref(`${PREF}shortcut`,JSON.stringify(DEFAULT_BINDING));shortcut=raw.trim()?validateBinding(JSON.parse(raw)):null;}catch{shortcut=null;}
  return {englishProvider:providers.get(english)?.language==='en'?english:'wiktionary-en',hebrewProvider:providers.get(hebrew)?.language==='he'?hebrew:'wiktionary-he',shortcut};
}
export function saveSettings(prefs,settings){
  if(providers.get(settings.englishProvider)?.language!=='en'||providers.get(settings.hebrewProvider)?.language!=='he')throw new Error('Choose a dictionary for the selected language.');
  const binding=validateBinding(settings.shortcut);
  prefs.setStringPref(`${PREF}english`,settings.englishProvider);prefs.setStringPref(`${PREF}hebrew`,settings.hebrewProvider);prefs.setStringPref(`${PREF}shortcut`,JSON.stringify(binding));
}
export function openSettings(window,{prefs,credentials,onCredentialsChanged,conflict}){
  const {document}=window;const existing=document.getElementById('define-word-settings');if(existing){existing.focus();return existing;}
  const origin=document.activeElement,el=(tag,value)=>{const n=document.createElementNS('http://www.w3.org/1999/xhtml',tag);if(value!==undefined)n.textContent=value;return n;};
  const dialog=el('dialog');dialog.id='define-word-settings';dialog.setAttribute('aria-labelledby','define-word-settings-heading');
  const heading=el('h2','Define settings');heading.id='define-word-settings-heading';dialog.append(heading);
  const current=readSettings(prefs),pickers={};let binding=current.shortcut;
  for(const [lang,label,prop] of [['en','English dictionary','englishProvider'],['he','Hebrew dictionary','hebrewProvider']]){
    const row=el('label',label),select=el('select');for(const p of providers.values())if(p.language===lang){const option=el('option',p.label+(p.keyRequired?' · API key required':''));option.value=p.id;select.append(option);}select.value=current[prop];pickers[prop]=select;row.append(select);dialog.append(row);
  }
  const error=el('p',conflict?.()||'');error.setAttribute('role','alert');
  const shortcutLabel=el('label','Keyboard shortcut'),field=el('input');field.readOnly=true;field.value=bindingLabel(binding);shortcutLabel.append(field);dialog.append(shortcutLabel);
  const actions=el('div');actions.className='dw-actions';const record=el('button','Record shortcut'),disable=el('button','Disable shortcut');record.type=disable.type='button';actions.append(record,disable);dialog.append(actions);
  let recording=false;
  record.addEventListener('click',()=>{recording=true;field.value='Press a shortcut…';field.focus();});
  field.addEventListener('keydown',event=>{
    if(!recording)return;event.preventDefault();event.stopPropagation();if(event.key==='Escape'){recording=false;field.value=bindingLabel(binding);return;}
    if(event.isComposing||event.getModifierState?.('AltGraph'))return;
    try{const next=validateBinding({code:event.code,ctrl:event.ctrlKey,alt:event.altKey,shift:event.shiftKey,meta:event.metaKey});const problem=findConflict(window,next);if(problem)throw new Error(problem);binding=next;recording=false;field.value=bindingLabel(binding);error.textContent='';}catch(problem){error.textContent=problem.message;}
  });
  disable.addEventListener('click',()=>{binding=null;recording=false;field.value='Disabled';});
  const save=el('button','Save settings');save.type='button';save.addEventListener('click',()=>{try{if(recording)throw new Error('Finish recording the shortcut first.');const problem=findConflict(window,binding);if(problem)throw new Error(problem);saveSettings(prefs,{englishProvider:pickers.englishProvider.value,hebrewProvider:pickers.hebrewProvider.value,shortcut:binding});error.textContent='Settings saved.';}catch(problem){error.textContent=problem.message;}});dialog.append(save);
  dialog.append(el('h3','Optional Merriam-Webster keys'),el('p','Keys are saved in Firefox credential storage. A separate key is needed for each dictionary.'));
  for(const id of ['mw-collegiate','mw-learners']){
    const row=el('label',providers.get(id).label),input=el('input');input.type='password';input.autocomplete='off';input.maxLength=512;row.append(input);dialog.append(row);
    const buttons=el('div');buttons.className='dw-actions';const set=el('button','Save key'),remove=el('button','Remove key');set.type=remove.type='button';buttons.append(set,remove);dialog.append(buttons);
    async function change(action){set.disabled=remove.disabled=true;try{await action();input.value='';onCredentialsChanged?.(id);error.textContent='Dictionary key updated.';}catch{error.textContent='Could not update the key. Check the value and unlock Firefox credential storage, then try again.';}finally{set.disabled=remove.disabled=false;}}
    set.addEventListener('click',()=>change(()=>credentials.set(id,input.value)));remove.addEventListener('click',()=>change(()=>credentials.remove(id)));
  }
  const info=el('button','Get a Merriam-Webster API key');info.type='button';info.addEventListener('click',()=>window.openTrustedLinkIn('https://dictionaryapi.com/','tab'));dialog.append(info,error);
  const done=el('button','Done');done.type='button';done.addEventListener('click',()=>dialog.close());dialog.append(done);dialog.addEventListener('close',()=>{dialog.remove();if(origin?.isConnected)origin.focus();});
  document.documentElement.append(dialog);dialog.showModal();return dialog;
}
