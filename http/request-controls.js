// Fixed-window request quotas and bounded async caches.
// These are per-process guards; deploy a shared store for multi-instance global quotas.
export function createRateLimiter({limit, windowMs=3600000, maxKeys=1000, now=Date.now}) {
  if(!Number.isInteger(limit)||limit<1||!Number.isInteger(maxKeys)||maxKeys<1)
    throw new TypeError('Positive rate-limit settings are required.');
  const entries=new Map();
  return function exceeded(identity) {
    const tick=now();
    const current=entries.get(identity);
    if(current&&current.until>=tick){
      current.count++;
      return current.count>limit;
    }
    if(entries.size>=maxKeys){
      for(const [key,entry] of entries)if(entry.until<tick)entries.delete(key);
      if(entries.size>=maxKeys)entries.delete(entries.keys().next().value);
    }
    entries.set(identity,{count:1,until:tick+windowMs});
    return false;
  };
}

export function createAsyncCache({ttl=600000,maxEntries=200,now=Date.now}={}) {
  if(!Number.isInteger(maxEntries)||maxEntries<1||!(ttl>0))
    throw new TypeError('Positive cache settings are required.');
  const entries=new Map();
  return {
    async getOrCreate(key,loader){
      const tick=now();
      const existing=entries.get(key);
      if(existing&&existing.expires>tick)return existing.promise;
      if(existing)entries.delete(key);
      if(entries.size>=maxEntries){
        for(const [k,entry] of entries)if(entry.expires<=tick)entries.delete(k);
        if(entries.size>=maxEntries)entries.delete(entries.keys().next().value);
      }
      // The promise is stored immediately, coalescing concurrent lookups.
      const promise=Promise.resolve().then(loader);
      const entry={promise,expires:tick+ttl};
      entries.set(key,entry);
      try{return await promise;}
      catch(error){
        if(entries.get(key)===entry)entries.delete(key);
        throw error;
      }
    }
  };
}
