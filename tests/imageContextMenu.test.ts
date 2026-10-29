import assert from "node:assert/strict";
import test from "node:test";
import { imageContextMenu } from "../electron/imageContextMenu";

const image = {mediaType:"image" as const, hasImageContents:true, srcURL:"https://daemon.example/sessions/session/images/item?zotigoHost=remote",x:123,y:456};

test("image menu saves the exact host-scoped URL and copies image pixels at the clicked position", () => {
  const saved:string[]=[];
  const copied:number[][]=[];
  const menu=imageContextMenu(image,{downloadURL:url=>saved.push(url),copyImageAt:(x,y)=>copied.push([x,y])},"zh-CN");
  assert.deepEqual(menu.map(item=>[item.label,item.enabled]),[["图片另存为…",true],["复制图片",true]]);
  // Electron supplies callback arguments; neither action depends on them.
  menu[0].click?.(null!,null!,null!);
  menu[1].click?.(null!,null!,null!);
  assert.deepEqual(saved,[image.srcURL]);
  assert.deepEqual(copied,[[123,456]]);
});

test("file and enlarged previews support data/blob images; failed images disable actions",()=>{
  const contents={downloadURL:()=>{},copyImageAt:()=>{}};
  for(const srcURL of ["data:image/png;base64,AAAA","blob:https://app.example/id"]) {
    assert.ok(imageContextMenu({...image,srcURL},contents,"en").every(item=>item.enabled));
  }
  assert.deepEqual(imageContextMenu({...image,hasImageContents:false},contents,"en").map(item=>item.enabled),[false,false]);
  assert.equal(imageContextMenu({...image,srcURL:"file:///private/image.png"},contents,"en")[0].enabled,false);
  assert.deepEqual(imageContextMenu({...image,mediaType:"none"},contents,"en"),[]);
  assert.equal(imageContextMenu(image,contents,"en")[1].label,"Copy image");
});
