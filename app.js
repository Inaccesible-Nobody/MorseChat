(() => {
  const $ = (id) => document.getElementById(id);
  const supabaseConfig=window.MORSE_CHAT_CONFIG||{};
  const chatClient=window.supabase?.createClient&&supabaseConfig.url&&supabaseConfig.publishableKey?window.supabase.createClient(supabaseConfig.url,supabaseConfig.publishableKey):null;
  const MORSE = {
    A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',
    0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.', '.':'.-.-.-', ',':'--..--', '?':'..--..', "'":'.----.', '!':'-.-.--', '/':'-..-.', '(':'-.--.', ')':'-.--.-', '&':'.-...', ':':'---...', ';':'-.-.-.', '=':'-...-', '+':'.-.-.', '-':'-....-', '_':'..--.-', '"':'.-..-.', '$':'...-..-', '@':'.--.-.'
  };
  const REVERSE = Object.fromEntries(Object.entries(MORSE).map(([k,v])=>[v,k]));
  const DEFAULTS = [
    ['HELLO THERE','Greetings'],['HOW ARE YOU','Everyday'],['GOOD MORNING','Greetings'],['GOOD NIGHT','Greetings'],['THANK YOU','Responses'],['YOU ARE WELCOME','Responses'],['SEE YOU SOON','Everyday'],['I AM HERE','Everyday'],['YES','Responses'],['NO','Responses'],['PLEASE REPEAT','Communication'],['I NEED HELP','Emergency'],['WHERE ARE YOU','Questions'],['WHAT IS YOUR NAME','Questions'],['STOP','Emergency'],['WAIT','Communication'],['READY','Responses'],['I UNDERSTAND','Responses'],['MESSAGE RECEIVED','Communication'],['MEET ME THERE','Everyday']
  ].map(([phrase,category],i)=>({id:'d'+i,phrase,category,source:'default'}));
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key,value) => localStorage.setItem(key,JSON.stringify(value));
  let mine = load('signal-mine',[]);
  let community = load('signal-community',[]);
  let history = load('signal-history',[]);
  let mode='send', receiveInputMode='morse', activeDictionary='default', targetVisible=true, decodedVisible=true, incomingMorseVisible=true, audioOn=true, chartVisible=false;
  let elements='', decoded='', lastTap=0, autoTimer=null, wordTimer=null, wordSpaceReady=false, currentTarget=DEFAULTS[0].phrase;
  let translatorElements='', translatorDecoded='', translatorTokens=[], translatorAutoTimer=null, translatorWordTimer=null;
  let chatSession=null, chatProfile=null, chatRooms=[], activeChatRoom=null, chatChannel=null, chatDisplayMode='text';
  let chatElements='', chatTokens=[], chatAutoTimer=null, chatWordTimer=null;
  let audioContext=null;
  const unitMs = () => 1200 / Number($('wpm').value);
  const gapUnits = () => 7;
  const phraseBank = () => [...DEFAULTS,...community,...mine];

  function beep(duration=unitMs()) {
    if(!audioOn) return;
    try {
      audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audioContext.state==='suspended') audioContext.resume();
      const osc=audioContext.createOscillator(), gain=audioContext.createGain();
      osc.type='sine'; osc.frequency.value=600; gain.gain.setValueAtTime(.0001,audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.12,audioContext.currentTime+.008);
      gain.gain.setValueAtTime(.12,audioContext.currentTime+duration/1000*.8);
      gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration/1000);
      osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration/1000+.01);
    } catch(e) { console.warn('Audio unavailable',e); }
  }
  function renderSignal() {
    $('signal-display').innerHTML = elements ? [...elements].map(c=>`<span>${c==='.'?'·':'−'}</span>`).join('') : '<span class="placeholder">Your signal will appear here</span>';
    $('decoded-output').innerHTML=decoded ? [...decoded].map(c=>c===' '?'<span class="space-marker" aria-label="word space">␠</span>':`<span>${escapeHtml(c)}</span>`).join('') : '_';
    $('decoded-output').style.visibility=decodedVisible?'visible':'hidden';
    $('input-state').textContent=elements?'SIGNAL IN PROGRESS':wordSpaceReady?'WORD SPACE INSERTED · START NEXT WORD':'AWAITING SIGNAL';
  }
  function decodeCurrent() {
    if(!elements) return;
    const letter=REVERSE[elements] || '�';
    decoded+=letter;
    elements='';
    renderSignal();
  }
  function addElement(value) {
    clearTimeout(autoTimer);clearTimeout(wordTimer);
    wordSpaceReady=false;
    elements+=value;beep(value==='.'?unitMs():unitMs()*3);lastTap=Date.now();
    renderSignal();
    // 3 units ends a character. The longer threshold ends a word.
    autoTimer=setTimeout(()=>{ decodeCurrent(); autoTimer=null; },unitMs()*3);
    wordTimer=setTimeout(()=>{ if(elements) decodeCurrent(); if(decoded && !decoded.endsWith(' ')){decoded+=' ';wordSpaceReady=true;} renderSignal(); wordTimer=null; },unitMs()*gapUnits());
  }
  function commit() { clearTimeout(autoTimer);clearTimeout(wordTimer);wordSpaceReady=false;decodeCurrent(); wordTimer=setTimeout(()=>{ if(decoded && !decoded.endsWith(' ')){decoded+=' ';wordSpaceReady=true;} renderSignal(); wordTimer=null; },unitMs()*gapUnits()); }
  function undo() {
    clearTimeout(autoTimer);clearTimeout(wordTimer);
    if(elements){elements=elements.slice(0,-1);}
    else if(decoded){decoded=decoded.trimEnd();decoded=decoded.slice(0,-1);}
    renderSignal();
  }
  function clearMessage(){clearTimeout(autoTimer);clearTimeout(wordTimer);elements='';decoded='';wordSpaceReady=false;renderSignal();setFeedback('Message cleared.');}
  function setFeedback(message,type=''){ $('feedback').textContent=message;$('feedback').className='feedback '+type; }
  function switchMode(next) {
    mode=next;document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
    $('practice-label').textContent=mode==='send'?'TRANSMIT / TARGET PHRASE':'RECEIVE / DECODE AUDIO';
    $('replay-receive').hidden=mode!=='receive';
    $('receive-input-switch').hidden=mode!=='receive';
    $('receive-signal-wrap').hidden=mode!=='receive';
    $('target-wrap').style.display=mode==='send'?'block':'none';
    $('submit-label').textContent=mode==='send'?'CHECK PHRASE':'CHECK ANSWER';
    $('feedback').textContent=mode==='send'?'Press J for dit or K for dah.':'Listen to the phrase, then enter your answer as Morse or text.';
    clearMessage();
    renderReceiveInputMode();
    if(mode==='receive') playReceivePhrase();
  }
  function renderReceiveInputMode() {
    const textMode=mode==='receive' && receiveInputMode==='text';
    $('receive-text-input').hidden=!textMode;
    $('signal-display').hidden=textMode;
    $('decoded-wrap').hidden=mode==='receive';
    $('toggle-incoming-morse').hidden=mode!=='receive';
    $('receive-signal').hidden=!incomingMorseVisible;
    $('toggle-incoming-morse').textContent=incomingMorseVisible?'HIDE':'SHOW';
    ['dit-key','dah-key','commit-key','backspace-key','clear-key'].forEach(id=>$(id).hidden=textMode);
    $('input-label').firstChild.textContent=textMode?'TEXT ANSWER':'MORSE INPUT';
    document.querySelectorAll('.receive-input-option').forEach(b=>b.classList.toggle('active',b.dataset.inputMode===receiveInputMode));
  }
  function chooseTarget(){const items=phraseBank();currentTarget=items[Math.floor(Math.random()*items.length)].phrase;$('target-phrase').textContent=currentTarget;}
  function playText(text,callback) {
    const sequence=[];
    [...text.toUpperCase()].forEach((ch,i)=>{
      if(ch===' '){sequence.push({gap:unitMs()*7});return;}
      const code=MORSE[ch];if(!code)return;
      [...code].forEach((s,j)=>{sequence.push({tone:s==='.'?unitMs():unitMs()*3});if(j<code.length-1)sequence.push({gap:unitMs()});});
      if(i<text.length-1 && text[i+1]!==' ')sequence.push({gap:unitMs()*3});
    });
    let t=0;
    sequence.forEach(item=>{if(item.tone){setTimeout(()=>beep(item.tone),t);t+=item.tone;}else t+=item.gap;});
    if(callback)setTimeout(callback,t+100);
  }
  function playReceivePhrase(){
    chooseTarget();
    $('receive-signal').innerHTML=[...currentTarget].map(ch=>ch===' '?' / ':`${MORSE[ch]||''} `).join('').trim().replaceAll('.', '·').replaceAll('-', '−')||'—';
    $('receive-signal').textContent=[...currentTarget].map(ch=>ch===' '?' / ':`${MORSE[ch]||''} `).join('').trim()||'-';
    playText(currentTarget);
  }
  function checkPhrase(){
    clearTimeout(autoTimer);clearTimeout(wordTimer);if(elements)decodeCurrent();
    const source=mode==='receive' && receiveInputMode==='text' ? $('receive-text-input').value : decoded;
    const answer=source.trim().replace(/\s+/g,' ').toUpperCase();
    const target=currentTarget.toUpperCase();
    const correct=answer===target;
    const attempted=answer.length;
    history.unshift({date:new Date().toISOString(),mode,correct,answer,target,characters:attempted});
    history=history.slice(0,100);save('signal-history',history);renderProgress();
    setFeedback(correct?'MATCH CONFIRMED. Nice clean transmission.':`NOT A MATCH. You sent: ${answer||'—'}`,correct?'good':'bad');
    if(correct && mode==='send') setTimeout(()=>{chooseTarget();clearMessage();},1200);
    else if(mode==='receive') setTimeout(()=>{clearMessage();$('receive-text-input').value='';playReceivePhrase();},1600);
  }
  function renderChart(){
    $('morse-chart').innerHTML=Object.entries(MORSE).map(([k,v])=>`<div class="chart-item"><b>${k}</b><small>${v.replaceAll('.','·').replaceAll('-','−')}</small></div>`).join('');
    $('morse-chart').hidden=!chartVisible;
  }
  function renderDictionary(){
    const all=activeDictionary==='default'?DEFAULTS:activeDictionary==='community'?community:mine;
    const q=$('phrase-search').value.trim().toLowerCase();
    const filtered=all.filter(x=>x.phrase.toLowerCase().includes(q)||(x.category||'').toLowerCase().includes(q));
    $('default-count').textContent=DEFAULTS.length;$('community-count').textContent=community.length;$('mine-count').textContent=mine.length;
    $('dict-description').textContent=activeDictionary==='default'?'APP-MANAGED PHRASES':activeDictionary==='community'?'SHARED COMMUNITY PHRASES':'YOUR PRIVATE PHRASES';
    $('phrase-list').innerHTML=filtered.length?filtered.map(x=>`<div class="phrase-card"><div><strong>${escapeHtml(x.phrase)}</strong><small>${escapeHtml(x.category||'UNCATEGORIZED')}</small></div><div class="phrase-actions"><button data-use="${x.id}">PRACTISE ↗</button>${x.source!=='default'?`<button data-delete="${x.id}">DELETE</button>`:''}</div></div>`).join(''):'<div class="empty-state">NO PHRASES FOUND</div>';
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function renderProgress(){
    const checks=history.filter(x=>x.mode==='send');const correct=checks.filter(x=>x.correct).length;
    $('stat-sessions').textContent=history.length;$('stat-accuracy').textContent=checks.length?Math.round(correct/checks.length*100)+'%':'—';
    $('stat-characters').textContent=history.reduce((n,x)=>n+x.characters,0);
    $('history-list').innerHTML=history.length?history.slice(0,12).map(x=>`<div class="history-item"><span>${x.mode.toUpperCase()} / ${x.correct?'MATCH':'RETRY'} <small>${new Date(x.date).toLocaleString()}</small></span><span>${x.characters} CHARS</span></div>`).join(''):'<div class="empty-state">NO PRACTICE HISTORY YET</div>';
  }
  function addKey(value){addElement(value);}
  $('replay-receive').addEventListener('click',()=>playText(currentTarget));
  $('dit-key').addEventListener('click',()=>addKey('.'));$('dah-key').addEventListener('click',()=>addKey('-'));
  $('commit-key').addEventListener('click',commit);$('backspace-key').addEventListener('click',undo);$('clear-key').addEventListener('click',clearMessage);$('submit-key').addEventListener('click',checkPhrase);
  document.addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea,select'))return;
    if(e.repeat)return;
    if($('view-chat').classList.contains('active')){
      if(!chatSession||!activeChatRoom)return;
      if(e.key.toLowerCase()==='j'){e.preventDefault();addChatElement('.');}
      else if(e.key.toLowerCase()==='k'){e.preventDefault();addChatElement('-');}
      else if(e.code==='Space'){e.preventDefault();commitChatCharacter();}
      else if(e.key.toLowerCase()==='i'){e.preventDefault();clearChatComposer();}
      else if(e.key==='Backspace'){e.preventDefault();undoChatComposer();}
      else if(e.key==='Enter'){e.preventDefault();sendChatMessage();}
      return;
    }
    if(e.key.toLowerCase()==='j'){e.preventDefault();addKey('.');}
    else if(e.key.toLowerCase()==='k'){e.preventDefault();addKey('-');}
    else if(e.code==='Space'){e.preventDefault();commit();}
    else if(e.key==='Backspace'){e.preventDefault();undo();}
    else if(e.key.toLowerCase()==='i'){e.preventDefault();clearMessage();}
    else if(e.key==='Enter'){e.preventDefault();checkPhrase();}
  });

  const keyButtonMap={j:'dit-key',k:'dah-key',' ':'commit-key',backspace:'backspace-key',i:'clear-key',enter:'submit-key'};
  document.addEventListener('keydown',e=>{
    const id=keyButtonMap[e.key.toLowerCase()] || keyButtonMap[e.key];
    if(id){const button=$(id);if(button&&!button.hidden)button.classList.add('is-pressed');}
  });
  document.addEventListener('keyup',e=>{
    const id=keyButtonMap[e.key.toLowerCase()] || keyButtonMap[e.key];
    if(id){const button=$(id);if(button)button.classList.remove('is-pressed');}
  });
  document.querySelectorAll('.key').forEach(button=>{
    button.addEventListener('pointerdown',()=>button.classList.add('is-pressed'));
    ['pointerup','pointerleave','pointercancel'].forEach(type=>button.addEventListener(type,()=>button.classList.remove('is-pressed')));
  });

  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===b));
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+b.dataset.view));
    if(b.dataset.view==='progress')renderProgress();if(b.dataset.view==='dictionary')renderDictionary();
  }));
  document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>switchMode(b.dataset.mode)));
  document.querySelectorAll('.receive-input-option').forEach(b=>b.addEventListener('click',()=>{receiveInputMode=b.dataset.inputMode;renderReceiveInputMode();if(receiveInputMode==='text'&&mode==='receive')$('receive-text-input').focus();}));
  $('receive-text-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();checkPhrase();}});
  $('wpm').addEventListener('input',e=>{$('wpm-value').textContent=e.target.value;});
  $('toggle-target').addEventListener('click',()=>{targetVisible=!targetVisible;$('target-phrase').style.visibility=targetVisible?'visible':'hidden';$('toggle-target').textContent=targetVisible?'HIDE TARGET':'SHOW TARGET';});
  $('toggle-decoded').addEventListener('click',()=>{decodedVisible=!decodedVisible;$('toggle-decoded').textContent=decodedVisible?'HIDE':'SHOW';renderSignal();});
  $('toggle-incoming-morse').addEventListener('click',()=>{incomingMorseVisible=!incomingMorseVisible;renderReceiveInputMode();});
  $('audio-toggle').addEventListener('click',e=>{audioOn=!audioOn;e.target.classList.toggle('on',audioOn);e.target.textContent=audioOn?'ON':'OFF';});
  $('chart-toggle').addEventListener('click',e=>{chartVisible=!chartVisible;e.target.textContent=chartVisible?'HIDE':'SHOW';e.target.classList.toggle('on',chartVisible);renderChart();});
  $('plain-input').addEventListener('input',()=>{const text=$('plain-input').value.toUpperCase();$('morse-translation').textContent=[...text].map(c=>c===' '?' / ':MORSE[c]||'').join(' ').trim()||'—';});
  document.querySelectorAll('.translator-mode').forEach(b=>b.addEventListener('click',()=>{
    const textMode=b.dataset.translatorMode==='text';
    $('translator-text-mode').hidden=!textMode;$('translator-morse-mode').hidden=textMode;
    document.querySelectorAll('.translator-mode').forEach(x=>x.classList.toggle('active',x===b));
    (textMode?$('plain-input'):$('morse-input')).focus();
  }));
  function decodeMorseTranslation(){
    const source=$('morse-input').value.trim().replace(/[·•]/g,'.').replace(/[−–—]/g,'-');
    $('decoded-translation').textContent=source?source.split('/').map(word=>word.trim().split(/\s+/).filter(Boolean).map(code=>REVERSE[code]||'�').join('')).join(' '):'—';
  }
  $('morse-input').addEventListener('input',decodeMorseTranslation);
  $('morse-input').addEventListener('input',()=>{
    const source=$('morse-input').value.trim().replace(/[\u00b7\u2022]/g,'.').replace(/[\u2212\u2013\u2014]/g,'-');
    $('decoded-translation').textContent=source?source.split('/').map(word=>word.trim().split(/\s+/).filter(Boolean).map(code=>REVERSE[code]||'?').join('')).join(' '):'-';
  });
  $('clear-morse-translator').addEventListener('click',()=>{$('morse-input').value='';$('decoded-translation').textContent='—';$('morse-input').focus();});

  function renderTranslatorMorse(){
    const committed=translatorTokens.map(token=>token==='/'?'/':token).join(' ');
    $('morse-input').value=[committed,translatorElements].filter(Boolean).join(' ')||'-';
    $('decoded-translation').textContent=translatorDecoded||'-';
  }
  function commitTranslatorLetter(){
    if(!translatorElements)return;
    translatorTokens.push(translatorElements);
    translatorDecoded+=REVERSE[translatorElements]||'?';
    translatorElements='';renderTranslatorMorse();
  }
  function addTranslatorElement(value){
    clearTimeout(translatorAutoTimer);clearTimeout(translatorWordTimer);
    beep(value==='.'?unitMs():unitMs()*3);
    translatorElements+=value;renderTranslatorMorse();
    translatorAutoTimer=setTimeout(()=>{commitTranslatorLetter();translatorAutoTimer=null;},unitMs()*3);
    translatorWordTimer=setTimeout(()=>{
      if(translatorElements)commitTranslatorLetter();
      if(translatorDecoded&&!translatorDecoded.endsWith(' ')){translatorDecoded+=' ';translatorTokens.push('/');}
      renderTranslatorMorse();translatorWordTimer=null;
    },unitMs()*7);
  }
  function commitTranslatorInput(){
    clearTimeout(translatorAutoTimer);clearTimeout(translatorWordTimer);translatorAutoTimer=translatorWordTimer=null;
    commitTranslatorLetter();
    translatorWordTimer=setTimeout(()=>{
      if(translatorDecoded&&!translatorDecoded.endsWith(' ')){translatorDecoded+=' ';translatorTokens.push('/');}
      renderTranslatorMorse();translatorWordTimer=null;
    },unitMs()*7);
  }
  function clearTranslatorInput(){
    clearTimeout(translatorAutoTimer);clearTimeout(translatorWordTimer);translatorAutoTimer=translatorWordTimer=null;
    translatorElements='';translatorDecoded='';translatorTokens=[];renderTranslatorMorse();
  }
  function undoTranslatorInput(){
    clearTimeout(translatorAutoTimer);clearTimeout(translatorWordTimer);translatorAutoTimer=translatorWordTimer=null;
    if(translatorElements)translatorElements=translatorElements.slice(0,-1);
    else if(translatorTokens.length){if(translatorTokens[translatorTokens.length-1]==='/')translatorTokens.pop();translatorTokens.pop();translatorDecoded=translatorTokens.map(token=>token==='/'?' ':REVERSE[token]||'?').join('').replace(/\s+/g,' ');}
    renderTranslatorMorse();
  }
  $('morse-input').addEventListener('keydown',e=>{
    if(e.repeat)return;
    const key=e.key.toLowerCase();
    if(key==='j'){e.preventDefault();addTranslatorElement('.');}
    else if(key==='k'){e.preventDefault();addTranslatorElement('-');}
    else if(e.code==='Space'){e.preventDefault();commitTranslatorInput();}
    else if(key==='i'){e.preventDefault();clearTranslatorInput();}
    else if(key==='backspace'){e.preventDefault();undoTranslatorInput();}
  });
  $('clear-morse-translator').addEventListener('click',clearTranslatorInput);
  $('clear-morse-translator').addEventListener('click',()=>{$('decoded-translation').textContent='-';});
  $('play-translation').addEventListener('click',()=>playText($('plain-input').value));
  $('clear-translator').addEventListener('click',()=>{$('plain-input').value='';$('morse-translation').textContent='—';});
  document.querySelectorAll('.dict-tab').forEach(b=>b.addEventListener('click',()=>{activeDictionary=b.dataset.dict;document.querySelectorAll('.dict-tab').forEach(x=>x.classList.toggle('active',x===b));$('open-add').style.display=activeDictionary==='default'?'none':'inline-block';renderDictionary();}));
  $('phrase-search').addEventListener('input',renderDictionary);
  $('open-add').addEventListener('click',()=>{$('add-form').hidden=false;$('new-phrase').focus();});
  $('close-add').addEventListener('click',()=>$('add-form').hidden=true);
  $('save-phrase').addEventListener('click',()=>{
    const phrase=$('new-phrase').value.trim().toUpperCase().replace(/\s+/g,' ');
    if(!phrase){$('new-phrase').focus();return;}
    const dest=$('new-destination').value;const item={id:'u'+Date.now(),phrase,category:$('new-category').value.trim(),source:dest};
    if(dest==='mine'){mine.push(item);save('signal-mine',mine);}else{community.push(item);save('signal-community',community);}
    $('new-phrase').value='';$('new-category').value='';$('add-form').hidden=true;activeDictionary=dest;
    document.querySelectorAll('.dict-tab').forEach(x=>x.classList.toggle('active',x.dataset.dict===dest));renderDictionary();
  });
  $('phrase-list').addEventListener('click',e=>{
    const use=e.target.dataset.use,del=e.target.dataset.delete;
    if(use){const item=phraseBank().find(x=>x.id===use);if(item){currentTarget=item.phrase;switchMode('send');$('target-phrase').textContent=currentTarget;document.querySelector('[data-view="practice"]').click();}}
    if(del){mine=mine.filter(x=>x.id!==del);community=community.filter(x=>x.id!==del);save('signal-mine',mine);save('signal-community',community);renderDictionary();}
  });
  $('clear-history').addEventListener('click',()=>{history=[];save('signal-history',history);renderProgress();});
  function setChatStatus(message){$('chat-auth-status').textContent=message;$('chat-app-status').textContent=message;}
  function formatMorseForDisplay(code){return String(code||'').replaceAll('.','\u00b7').replaceAll('-','\u2212');}
  function decodeChatMorse(code){
    return String(code||'').trim().split(/\s*\/\s*/).map(word=>word.trim().split(/\s+/).filter(Boolean).map(letter=>REVERSE[letter]||'?').join('')).join(' ');
  }
  function renderChatComposer(){
    const parts=[...chatTokens,chatElements].filter(Boolean);
    $('chat-composer-preview').classList.toggle('is-empty',parts.length===0);
    $('chat-composer-preview').textContent=parts.length?formatMorseForDisplay(parts.join(' ')):'Press J or K to enter Morse...';
    $('chat-send-message').disabled=!activeChatRoom||parts.length===0;
  }
  function decodeChatCharacter(){if(!chatElements)return;chatTokens.push(chatElements);chatElements='';renderChatComposer();}
  function addChatElement(value){
    clearTimeout(chatAutoTimer);clearTimeout(chatWordTimer);beep(value==='.'?unitMs():unitMs()*3);
    chatElements+=value;renderChatComposer();
    chatAutoTimer=setTimeout(()=>{decodeChatCharacter();chatAutoTimer=null;},unitMs()*3);
    chatWordTimer=setTimeout(()=>{if(chatElements)decodeChatCharacter();if(chatTokens.length&&chatTokens[chatTokens.length-1]!=='/')chatTokens.push('/');renderChatComposer();chatWordTimer=null;},unitMs()*7);
  }
  function commitChatCharacter(){
    clearTimeout(chatAutoTimer);clearTimeout(chatWordTimer);chatAutoTimer=chatWordTimer=null;
    decodeChatCharacter();
    renderChatComposer();
    chatWordTimer=setTimeout(()=>{if(chatTokens.length&&chatTokens[chatTokens.length-1]!=='/')chatTokens.push('/');renderChatComposer();chatWordTimer=null;},unitMs()*7);
  }
  function clearChatComposer(){clearTimeout(chatAutoTimer);clearTimeout(chatWordTimer);chatAutoTimer=chatWordTimer=null;chatElements='';chatTokens=[];renderChatComposer();}
  function undoChatComposer(){
    clearTimeout(chatAutoTimer);clearTimeout(chatWordTimer);chatAutoTimer=chatWordTimer=null;
    if(chatElements)chatElements=chatElements.slice(0,-1);
    else if(chatTokens.length){if(chatTokens[chatTokens.length-1]==='/')chatTokens.pop();chatTokens.pop();}
    renderChatComposer();
  }
  async function sendChatMessage(){
    if(!chatClient||!chatSession||!activeChatRoom)return;
    if(chatElements)commitChatCharacter();
    const morse=chatTokens.filter(Boolean).join(' ').replace(/\s*\/\s*$/,'').trim();
    if(!morse)return;
    $('chat-send-message').disabled=true;
    const {error}=await chatClient.from('morse_messages').insert({room_id:activeChatRoom.id,sender_id:chatSession.user.id,morse});
    if(error)setChatStatus(`Message failed: ${error.message}`);else clearChatComposer();
    renderChatComposer();
  }
  function renderChatRooms(){
    $('chat-room-list').innerHTML=chatRooms.length?chatRooms.map(room=>`<button type="button" class="chat-room-button ${activeChatRoom?.id===room.id?'active':''}" data-room-id="${escapeHtml(room.id)}"><strong>${escapeHtml(room.room_name)}</strong><small>${escapeHtml(room.invite_code)}</small></button>`).join(''):'<div class="empty-state">NO ROOMS YET</div>';
  }
  async function loadChatRooms(){
    if(!chatClient||!chatSession)return;
    const {data,error}=await chatClient.from('morse_room_members').select('room_id, morse_rooms(id, room_name, invite_code, created_by)').eq('user_id',chatSession.user.id);
    if(error){setChatStatus(`Could not load rooms: ${error.message}`);return;}
    chatRooms=(data||[]).map(row=>Array.isArray(row.morse_rooms)?row.morse_rooms[0]:row.morse_rooms).filter(Boolean);
    renderChatRooms();
    if(activeChatRoom&&!chatRooms.some(room=>room.id===activeChatRoom.id))activeChatRoom=null;
    if(!activeChatRoom&&chatRooms.length)await selectChatRoom(chatRooms[0]);
  }
  function renderChatMessages(messages){
    $('chat-messages').innerHTML=messages.length?messages.map(message=>{
      const profile=Array.isArray(message.morse_profiles)?message.morse_profiles[0]:message.morse_profiles;
      const body=chatDisplayMode==='text'?decodeChatMorse(message.morse):formatMorseForDisplay(message.morse);
      return `<article class="chat-message ${message.sender_id===chatSession.user.id?'mine':''}"><div class="chat-message-meta"><strong>${escapeHtml(profile?.display_name||'Morse user')}</strong><time>${new Date(message.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></div><div class="chat-message-body">${escapeHtml(body)}</div></article>`;
    }).join(''):'<div class="empty-state">No messages yet. Send the first Morse signal.</div>';
    $('chat-messages').scrollTop=$('chat-messages').scrollHeight;
  }
  async function loadChatMessages(){
    if(!chatClient||!activeChatRoom)return;
    const {data,error}=await chatClient.from('morse_messages').select('id, room_id, sender_id, morse, created_at, morse_profiles(display_name)').eq('room_id',activeChatRoom.id).gte('created_at',new Date(Date.now()-24*60*60*1000).toISOString()).order('created_at',{ascending:true});
    if(error){setChatStatus(`Could not load messages: ${error.message}`);return;}
    renderChatMessages(data||[]);
  }
  async function selectChatRoom(room){
    activeChatRoom=chatRooms.find(item=>item.id===room.id)||room;room=activeChatRoom;renderChatRooms();clearChatComposer();
    $('chat-room-title').textContent=room.room_name;$('chat-invite-code').textContent=room.invite_code;$('chat-invite').hidden=false;$('chat-rename-room').hidden=room.created_by!==chatSession.user.id;
    const {count}=await chatClient.from('morse_room_members').select('user_id',{count:'exact',head:true}).eq('room_id',room.id);
    $('chat-room-members').textContent=`${count||1} MEMBERS`;
    if(chatChannel)await chatClient.removeChannel(chatChannel);
    await loadChatMessages();
    chatChannel=chatClient.channel(`morse-room-${room.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'morse_messages',filter:`room_id=eq.${room.id}`},()=>loadChatMessages()).subscribe();
  }
  async function loadChatPreference(){
    const {data,error}=await chatClient.from('morse_chat_settings').select('incoming_format').eq('user_id',chatSession.user.id).maybeSingle();
    if(error){setChatStatus(`Could not load chat settings: ${error.message}`);return;}
    if(!data){const {error:saveError}=await chatClient.from('morse_chat_settings').upsert({user_id:chatSession.user.id,incoming_format:'text'});if(saveError)setChatStatus(`Could not save chat settings: ${saveError.message}`);chatDisplayMode='text';}
    else chatDisplayMode=data.incoming_format;
    document.querySelectorAll('.chat-display-option').forEach(button=>button.classList.toggle('active',button.dataset.chatDisplay===chatDisplayMode));
  }
  async function setChatSession(session){
    chatSession=session;
    $('chat-setup').hidden=Boolean(session);$('chat-app').hidden=!session;
    if(!session){if(chatChannel&&chatClient)await chatClient.removeChannel(chatChannel);chatChannel=null;activeChatRoom=null;chatRooms=[];return;}
    const user=session.user;
    const displayName=user.user_metadata?.full_name||user.user_metadata?.name||user.email?.split('@')[0]||'Morse user';
    const {error:profileError}=await chatClient.from('morse_profiles').upsert({user_id:user.id,display_name:displayName},{onConflict:'user_id'});
    if(profileError){setChatStatus(`Could not load your profile: ${profileError.message}`);return;}
    $('chat-user-name').textContent=displayName;setChatStatus('Signed in. Share a room code to invite friends.');await loadChatPreference();await loadChatRooms();
  }
  async function initializeMorseChat(){
    if(!chatClient){$('chat-google-signin').disabled=true;setChatStatus('Supabase client or project configuration could not be loaded.');return;}
    if(location.protocol==='file:'){setChatStatus('Open this app through a local web server and add its URL to Supabase Auth redirect URLs before signing in.');}
    else setChatStatus('Sign in with Google to create or join Morse rooms.');
    $('chat-google-signin').addEventListener('click',async()=>{
      if(location.protocol==='file:'){setChatStatus('Google sign-in requires serving this app from an http:// or https:// URL.');return;}
      const {error}=await chatClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}${location.pathname}`}});
      if(error)setChatStatus(`Google sign-in failed: ${error.message}`);
    });
    $('chat-signout').addEventListener('click',async()=>{const {error}=await chatClient.auth.signOut();if(error)setChatStatus(`Sign out failed: ${error.message}`);});
    chatClient.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>setChatSession(session),0);});
    const {data,error}=await chatClient.auth.getSession();if(error)setChatStatus(`Could not restore sign-in: ${error.message}`);else await setChatSession(data.session);
  }
  $('chat-create-room-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!chatClient||!chatSession)return;
    const name=$('chat-room-name').value.trim();const {data,error}=await chatClient.rpc('create_morse_room',{p_name:name||'Morse room'});
    if(error){setChatStatus(`Could not create room: ${error.message}`);return;}
    $('chat-room-name').value='';await loadChatRooms();const room=Array.isArray(data)?data[0]:data;if(room)await selectChatRoom(room);
  });
  $('chat-join-room-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!chatClient||!chatSession)return;
    const code=$('chat-room-code').value.trim();const {data,error}=await chatClient.rpc('join_morse_room',{p_code:code});
    if(error){setChatStatus(`Could not join room: ${error.message}`);return;}
    $('chat-room-code').value='';await loadChatRooms();const room=Array.isArray(data)?data[0]:data;if(room)await selectChatRoom(room);
  });
  $('chat-room-list').addEventListener('click',e=>{const button=e.target.closest('[data-room-id]');if(button){const room=chatRooms.find(item=>item.id===button.dataset.roomId);if(room)selectChatRoom(room);}});
  $('chat-rename-room').addEventListener('click',async()=>{
    if(!chatClient||!activeChatRoom||activeChatRoom.created_by!==chatSession?.user.id)return;
    const name=window.prompt('Rename this Morse room:',activeChatRoom.room_name)?.trim();
    if(!name||name===activeChatRoom.room_name)return;
    const {error}=await chatClient.rpc('rename_morse_room',{p_room_id:activeChatRoom.id,p_room_name:name});
    if(error){setChatStatus(`Could not rename room: ${error.message}`);return;}
    activeChatRoom.room_name=name;chatRooms=chatRooms.map(room=>room.id===activeChatRoom.id?{...room,room_name:name}:room);
    $('chat-room-title').textContent=name;renderChatRooms();setChatStatus('Room name updated.');
  });
  const sidebarToggle=$('sidebar-toggle');
  sidebarToggle.addEventListener('click',()=>{
    const collapsed=document.querySelector('.shell').classList.toggle('sidebar-collapsed');
    sidebarToggle.setAttribute('aria-expanded',String(!collapsed));
    sidebarToggle.setAttribute('aria-label',collapsed?'Expand navigation':'Collapse navigation');
    sidebarToggle.title=collapsed?'Expand navigation':'Collapse navigation';
  });
  $('chat-copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('chat-invite-code').textContent);setChatStatus('Room code copied. Share it with your friends.');}catch{setChatStatus('Copy failed. Select and copy the room code.');}});
  $('chat-send-message').addEventListener('click',sendChatMessage);
  document.querySelectorAll('.chat-display-option').forEach(button=>button.addEventListener('click',async()=>{
    chatDisplayMode=button.dataset.chatDisplay;document.querySelectorAll('.chat-display-option').forEach(item=>item.classList.toggle('active',item===button));
    if(chatClient&&chatSession)await chatClient.from('morse_chat_settings').upsert({user_id:chatSession.user.id,incoming_format:chatDisplayMode,updated_at:new Date().toISOString()});
    if(activeChatRoom)loadChatMessages();
  }));
  $('chat-composer-preview').addEventListener('click',e=>e.currentTarget.focus());
  $('chat-composer-preview').tabIndex=0;
  initializeMorseChat();
  renderChart();renderDictionary();renderProgress();renderSignal();$('target-phrase').textContent=currentTarget;
})();
