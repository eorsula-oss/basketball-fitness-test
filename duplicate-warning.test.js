const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');

const source=fs.readFileSync(path.join(__dirname,'enhancements.js'),'utf8');

function runtime({rows=[],promptAnswer=null,confirmAnswer=false,fetchFails=false}={}){
  const nodes=new Map();
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',textContent:'',disabled:false,addEventListener(){}});
    return nodes.get(selector);
  };
  node('#newProfile').value='Kiala';
  node('#newGroup').value='U12.1';
  const context={
    window:{BASKETBALL_BACKUP_CONFIG:{url:'https://test.invalid',key:'test-key',testMode:false}},
    state:{profiles:['Vorhanden'],active:'Vorhanden',done:{Vorhanden:{}},photos:{},groups:{Vorhanden:'Sonstige'},profileMeta:{}},
    exercise:[],
    render(){},profiles(){},store(){},$ : node,
    document:{querySelectorAll(){return[]}},
    fetch:async()=>{if(fetchFails)throw new Error('offline');return{ok:true,json:async()=>rows}},
    prompt:()=>promptAnswer,confirm:()=>confirmAnswer,alert(){},
    Image:function(){},URL:{createObjectURL(){return''},revokeObjectURL(){}},console
  };
  vm.runInNewContext(source,context);
  return{context,nodes};
}

async function run(){
  const duplicate={profile_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',display_name:'  KIALA ',group_name:'U12.1',total_points:46};

  let test=runtime({rows:[duplicate]});
  await test.nodes.get('#addProfile').onclick();
  assert.deepEqual(test.context.state.profiles,['Vorhanden'],'Dubletten muessen standardmaessig abgebrochen werden');

  test=runtime({rows:[duplicate],promptAnswer:'NEU'});
  await test.nodes.get('#addProfile').onclick();
  assert.deepEqual(test.context.state.profiles,['Vorhanden','Kiala'],'Bewusst bestaetigte Namensgleichheit muss moeglich bleiben');

  test=runtime({rows:[]});
  await test.nodes.get('#addProfile').onclick();
  assert.deepEqual(test.context.state.profiles,['Vorhanden','Kiala'],'Neue eindeutige Profile muessen unveraendert angelegt werden');

  test=runtime({fetchFails:true,confirmAnswer:false});
  await test.nodes.get('#addProfile').onclick();
  assert.deepEqual(test.context.state.profiles,['Vorhanden'],'Bei fehlender Online-Pruefung entscheidet der Nutzer');

  test=runtime({fetchFails:true,confirmAnswer:true});
  await test.nodes.get('#addProfile').onclick();
  assert.deepEqual(test.context.state.profiles,['Vorhanden','Kiala'],'Offline-Anlegen bleibt nach Bestaetigung moeglich');
}

run().then(()=>console.log('Dublettenwarnung: 5 Tests erfolgreich.'));
