fetch('https://www.youtube.com/@MuseIndonesia').then(r=>r.text()).then(t => {
  const match = t.match(/"channelId":"(.*?)"/);
  if (match) console.log("Channel ID:", match[1]);
  
  // also extract some video IDs directly from the HTML to be safe
  const videoIds = [...t.matchAll(/"videoId":"(.*?)"/g)].map(m => m[1]);
  const uniqueIds = [...new Set(videoIds)].slice(0, 20);
  console.log("Video IDs:", uniqueIds);
});
