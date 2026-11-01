import test from "node:test";
import assert from "node:assert/strict";
import type { ClientApi } from "../shared/clientTypes";
import type { UpdateStatus } from "../shared/updates";
import { updateMachine, machineJob, runningUpdates, updateMachines } from "../src/machineUpdates";

const initial = (component: "daemon" | "desktop"): UpdateStatus => ({component,version:"1.0.0",commit:"old",channel:"development",custom:false,phase:"idle",target:{version:"1.0.1",commit:"new"}});
function fixture(options: {prepareFail?:string;applyFail?:string;cancel?:boolean;disconnect?:boolean} = {}) {
  const states = {daemon:initial("daemon"),client:initial("desktop")};
  const calls: string[] = [];
  let polls = 0;
  const api = {updateComponent:async(target:"daemon"|"client",action:string,_channel?:string,hostId?:string)=>{
    assert.equal(hostId,target === "daemon" ? "local" : undefined);
    calls.push(`${target}:${action}`);
    if(action === "prepare") states[target]={...states[target],phase:options.prepareFail === target ? "failed" : "ready",error:options.prepareFail === target ? "prepare failed" : undefined};
    if(action === "apply") {
      if(target === "client") assert.equal(states.daemon.phase,"completed","daemon must finish verified activation first");
      states[target]={...states[target],phase:target === "daemon" ? "waiting" : "completed",...(target === "client"?{version:"1.0.1",commit:"new",target:undefined}:{})};
      if(options.applyFail === target) states[target]={...states[target],phase:"failed",error:"activation failed"};
    }
    if(action === "status" && states[target].phase === "waiting") {
      if(options.disconnect && polls++ === 0) throw new Error("connection refused during restart");
      states[target]=options.cancel ? {...states[target],phase:"ready"} : {...states[target],phase:"completed",version:"1.0.1",commit:"new",target:undefined};
    }
    return states[target];
  }} as unknown as ClientApi;
  return {api,calls,states};
}
const localMachine = updateMachines([{id:"local",name:"Local",baseUrl:"http://localhost:8766",hasToken:false}])[0];
const remoteMachine = updateMachines([{id:"remote",name:"Remote",baseUrl:"http://remote:8766",hasToken:false}])[1];
const noWait=async()=>{};

test("machine update prepares every module and verifies daemon before applying client through reconnect",async()=>{
  const f=fixture({disconnect:true});
  await updateMachine(f.api,localMachine,()=>true,noWait);
  assert.equal(machineJob("local")?.completed,true);
  assert.deepEqual(f.calls.filter(x=>!x.endsWith(":status")),["daemon:prepare","client:prepare","daemon:apply","client:apply"]);
  assert.equal(runningUpdates.size,0);
});

test("preparation failure never applies either module",async()=>{
  const f=fixture({prepareFail:"client"});
  await updateMachine(f.api,localMachine,()=>true,noWait);
  assert.ok(machineJob("local")?.error?.includes("prepare failed"));
  assert.equal(f.calls.some(x=>x.endsWith(":apply")),false);
});

test("failed or cancelled daemon prevents client restart",async()=>{
  for(const options of [{applyFail:"daemon"},{cancel:true}]) {
    const f=fixture(options);let confirmations=0;
    await updateMachine(f.api,localMachine,()=>{confirmations++;return true;},noWait);
    assert.ok(machineJob("local")?.error);
    assert.equal(confirmations,0);
    assert.equal(f.calls.includes("client:apply"),false);
  }
});

test("declining restart preserves completed daemon and prepared client",async()=>{
  const f=fixture();
  await updateMachine(f.api,localMachine,()=>false,noWait);
  assert.equal(f.states.daemon.phase,"completed");assert.equal(f.states.client.phase,"ready");
  assert.equal(f.calls.includes("client:apply"),false);
  assert.match(machineJob("local")!.error!,/cancelled/);
});

test("client failure reports partial success and retry does not reapply completed daemon",async()=>{
  const f=fixture({applyFail:"client"});
  await updateMachine(f.api,localMachine,()=>true,noWait);
  assert.equal(f.states.daemon.phase,"completed");
  assert.match(machineJob("local")!.error!,/Client: activation failed/);
  f.calls.length=0;
  await updateMachine(f.api,localMachine,()=>true,noWait);
  assert.equal(f.calls.includes("daemon:prepare"),false);
  assert.equal(f.calls.includes("daemon:apply"),false);
});

test("remote machine never touches client and duplicate batch is ignored",async()=>{
  let finish: (()=>void)|undefined; const held=new Promise<void>(resolve=>{finish=resolve;});
  const calls:string[]=[];let state=initial("daemon");
  const api={updateComponent:async(target:string,action:string,_channel?:string,hostId?:string)=>{
    assert.equal(target,"daemon");assert.equal(hostId,"remote");calls.push(action);
    if(action==="prepare"){await held;state={...state,phase:"ready"};}
    if(action==="apply")state={...state,phase:"completed",version:"1.0.1",commit:"new",target:undefined};
    return state;
  }} as unknown as ClientApi;
  const first=updateMachine(api,remoteMachine,()=>{throw new Error("remote must never restart local client");},noWait);
  await Promise.resolve();
  await updateMachine(api,remoteMachine,()=>true,noWait);
  finish!();await first;
  assert.deepEqual(calls,["status","prepare","apply"]);
  assert.equal(machineJob("remote")?.completed,true);
});

test("a remote default daemon stays separate from the client machine",async()=>{
  const machines=updateMachines([{id:"local",name:"Local",baseUrl:"https://remote.example:8766",hasToken:true}]);
  assert.equal(machines.length,2);
  assert.deepEqual(machines[0],{id:"local",host:undefined,includeClient:true});
  assert.equal(machines[1].id,"daemon:local");
  assert.equal(machines[1].includeClient,false);
  const calls:Array<[string,string,string|undefined]>=[];
  const states={daemon:initial("daemon"),client:initial("desktop")};
  const api={updateComponent:async(target:"daemon"|"client",action:string,_channel?:string,hostId?:string)=>{
    calls.push([target,action,hostId]);
    if(action==="prepare")states[target]={...states[target],phase:"ready"};
    if(action==="apply")states[target]={...states[target],phase:"completed",version:"1.0.1",commit:"new",target:undefined};
    return states[target];
  }} as unknown as ClientApi;
  await updateMachine(api,machines[0],()=>true,noWait);
  assert.deepEqual(calls,[["client","status",undefined],["client","prepare",undefined],["client","apply",undefined]]);
  assert.equal(machineJob("local")?.completed,true);
  assert.equal(states.daemon.version,"1.0.0");
  calls.length=0;
  await updateMachine(api,machines[1],()=>{throw new Error("remote daemon must not restart client");},noWait);
  assert.deepEqual(calls,[["daemon","status","local"],["daemon","prepare","local"],["daemon","apply","local"]]);
  assert.equal(machineJob("daemon:local")?.completed,true);
});
