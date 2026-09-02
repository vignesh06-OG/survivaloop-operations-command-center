async function run() {
  console.log('--- A) API EVIDENCE ---');
  try {
    const loginRes = await fetch('https://survivaloop.vercel.app/api/auth/demo/ADMIN', { method: 'POST' });
    const cookie = loginRes.headers.get('set-cookie');
    console.log('LOGIN STATUS:', loginRes.status);
    
    const profileRes = await fetch('https://survivaloop.vercel.app/api/profile', {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Demo Admin', age: 26, city: 'Nashik', locality: 'College Road' })
    });
    console.log('PROFILE SAVE ENDPOINT: POST /api/profile');
    console.log('STATUS:', profileRes.status);
    console.log('BODY:', await profileRes.text());
    
    const simRes = await fetch('https://survivaloop.vercel.app/api/simulate', { 
      method: 'POST',
      headers: { cookie }
    });
    console.log('\nSEED ENDPOINT: POST /api/simulate');
    console.log('STATUS:', simRes.status);
    console.log('BODY:', await simRes.text());
    
    const overRes = await fetch('https://survivaloop.vercel.app/api/oversight', {
      headers: { cookie }
    });
    console.log('\nOVERSIGHT ENDPOINT: GET /api/oversight');
    console.log('STATUS:', overRes.status);
    const body = await overRes.text();
    console.log('BODY LENGTH:', body.length);
    console.log('BODY START:', body.substring(0, 150));

  } catch (e) {
    console.error(e);
  }
}
run();
