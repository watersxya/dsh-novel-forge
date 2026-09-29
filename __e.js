(function(){
  var bs=document.querySelectorAll('button');
  var out=[];
  for(var i=0;i<bs.length;i++){ var t=(bs[i].innerText||'').trim(); if(t && t.length<12) out.push({t:t, cls:bs[i].className, id:bs[i].id}); }
  return JSON.stringify(out);
})()
