# Yes, YOU!

เกมทายใจเพื่อนที่นั่งอยู่ด้วยกัน รองรับ 3–20 คน ใช้มือถือคนละเครื่อง
React + TypeScript + Vite + Tailwind CSS / Supabase Postgres, anonymous Auth และ Realtime / เตรียม Netlify

## สถานะปัจจุบัน

- มีหน้าเข้าเกม สร้าง/เข้าวง Lobby จัดที่นั่ง เล่นทุกสถานะ คะแนน และสรุปอันดับร่วม
- มี Demo Mode แยกชัดเจน ใช้ดูหน้าจอและกติกาในเครื่องเดียว ไม่ใช่ multiplayer
- มี backend SQL จริง พร้อมการตรวจสิทธิ์ การซ่อนคำถาม/คำทาย และ transaction ให้คะแนน
- ยังไม่ได้เชื่อม Supabase ของเจ้าของโปรเจกต์ หรือเผยแพร่บน Netlify
- ตรวจ build, unit tests และ integration tests บน PostgreSQL ใน Docker ได้ ผลล่าสุดอยู่ใน `TESTING.md`
- ยังต้องตรวจ browser บนมือถือ/desktop และทดสอบ Supabase Auth + API + websocket หลังตั้งค่า

## 1. เปิดเว็บบนเครื่องตัวเอง

ติดตั้ง Node.js 22 ขึ้นไป และ Git ถ้ายังไม่มี จากนั้นเปิด Terminal แล้วทำตามนี้:

```sh
git clone https://github.com/nakapo/Yesyou.git
cd Yesyou
npm ci
npm run dev
```

เปิดที่อยู่ที่ Terminal แสดง (ปกติ `http://localhost:5173`) แล้วกด **ลองเล่น Demo ก่อน**
แถบสีเหลืองด้านบนใช้สลับผู้เล่นเพื่อดูหน้าของ Host เจ้าของคำถาม และผู้ทาย
กด **จำลองเพื่อนตอบครบ** เพื่อทดลองไปถึงหน้าเฉลย

Demo ไม่เก็บคะแนนหรือสถานะข้ามการรีเฟรช ส่วนเกมออนไลน์คืนสถานะจาก backend

## 2. สร้าง Supabase (ทำครั้งเดียว)

1. ไปที่ https://supabase.com สร้าง Project ใหม่ จดรหัสผ่านฐานข้อมูลไว้กับตัวเอง **ไม่ต้องส่งรหัสผ่านมาในแชต และห้ามใส่ใน GitHub**
2. ที่ **Authentication → Sign In / Providers → Anonymous** เปิดอนุญาต anonymous sign-ins ชื่อเมนูอาจต่างเล็กน้อย
3. ไปที่ **SQL Editor** เปิด New query คัดลอกไฟล์ `supabase/migrations/202611170001_game.sql` ทั้งไฟล์ แล้วกด Run
4. เปิด query ใหม่ คัดลอก `supabase/migrations/202611170002_questions.sql` ทั้งไฟล์ แล้วกด Run จากนั้นทำเช่นเดียวกันกับ `supabase/migrations/202611170003_import_user_questions.sql` เพื่อใช้คลังจากเอกสารผู้ใช้ หากเคยรันสองไฟล์แรกแล้ว ให้รันเฉพาะไฟล์ 003 เพิ่ม
5. SQL แรกเพิ่ม `public.room_events` เข้า publication `supabase_realtime` แล้ว ตรวจที่ Database → Publications ว่ามีตารางนี้ ไม่ต้องเปิด realtime ให้ตารางอื่น
6. ที่ **Project Settings → API / API Keys** คัดลอก Project URL และ **Publishable key** (ขึ้นต้น `sb_publishable_…` สำหรับโปรเจกต์ใหม่)
7. สร้างไฟล์ `.env` ที่โฟลเดอร์เดียวกับ `package.json` โดยคัดลอกจาก `.env.example` แล้วเติมเพียงสองค่านี้:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

8. หยุด `npm run dev` ด้วย Ctrl+C แล้วสั่งใหม่ เพื่อให้ Vite โหลดค่าที่เพิ่ม
9. กดสร้างวงจากหน้าเว็บจริง เมื่อสร้างสำเร็จจะได้รหัสเช่น `pizza-a1b2c3`

**ห้ามใช้ `service_role`, `sb_secret_…` หรือรหัสผ่านฐานข้อมูลเป็นตัวแปร VITE ใด ๆ**
Publishable key มีไว้ใช้ใน browser ได้ โดยฐานข้อมูลตรวจสิทธิ์จาก anonymous identity ของแต่ละคน
ไม่ต้องสมัครอีเมล แต่อย่าล้างข้อมูลเว็บไซต์หรือใช้โหมดส่วนตัวถ้าต้องการเก็บตัวตนเดิม

SQL migrations ใช้ครั้งเดียวบนฐานข้อมูลใหม่ ถ้าใช้ Supabase CLI อยู่แล้ว ใช้ `supabase init` (ถ้ายังไม่มี config), `supabase link` และ `supabase db push` แทนการคัดลอก SQL ได้ ไม่ต้องทำทั้งสองวิธี

## 3. วิธีเล่นจริงและข้อกำหนดที่เลือกไว้

- QR และลิงก์แชร์เปิดหน้าเข้าวงเท่านั้น **ไม่มี room code หรือรหัสลับใน URL** ให้บอกรหัสกับเพื่อนแยกกัน
- ห้องใช้ชื่ออาหารตามด้วยตัวอักษรสุ่มเพื่อป้องกันรหัสชนกัน ตั้งรหัสลับแยกต่างหากได้
- Host ถือเป็นผู้เล่น เริ่มได้เมื่อมีอย่างน้อย 3 คน สูงสุด 20 คน
- ภาพ avatar ใช้ชุด geometric retro ตามแนวภาพล่าสุด แทน pixel art
- เจ้าของคำถามสุ่มใหม่ได้ก่อนเปิดให้ทายเท่านั้น คำถามที่ข้ามถูกนับว่าใช้แล้ว เมื่อคลังหมดจึงวนใหม่
- ตอนเปิดให้ทาย backend บันทึก snapshot ผู้ทาย ห้ามเฉลยก่อนคนที่ยังมีสิทธิ์ตอบครบ
- ตัวเลือกก่อนกดยืนยันเก็บในหน้าจอ ยืนยันแล้วแก้ไม่ได้
- ไม่มีเวลานับถอยหลัง หลังเฉลย Host เจ้าของคำถามเดิม หรือเจ้าของตาถัดไปกดเริ่มตาต่อเมื่อคุยกันเสร็จ
- Host เปิดรับคนเพิ่มได้ใน PREPARING หรือ REVEALED เท่านั้น ระบบปิดรับอีกครั้งเมื่อเปิดทาย คนใหม่เข้า queue และมีสิทธิ์เมื่อเปิดตาใหม่
- ปรับลำดับด้วย drag-and-drop ใน Lobby หรือปุ่มขึ้น/ลง ในระหว่างตาปรับได้เฉพาะ PREPARING/REVEALED และเปลี่ยนเฉพาะผู้ที่ยังรอในรอบวงนั้น คนที่เล่นแล้วไม่ถูกดึงมาเล่นซ้ำ
- ถ้า offline จะไม่ตัดผู้ทายทันที Host กดตัดเฉพาะตาที่ค้างได้ หรือข้ามเจ้าของคำถามโดยไม่คิดคะแนน
- ทุกเครื่องส่ง heartbeat ทุก 10 วินาที แสดง offline เมื่อเงียบเกิน 35 วินาที ถ้า Host เงียบเกิน 60 วินาที ผู้เล่นออนไลน์ตามลำดับที่นั่งจะรับสิทธิ์เมื่อมี heartbeat ถัดไป ไม่ต้องกดเอง ล็อกแถวห้องจึงมี Host เดียว หากทุกเครื่องปิดอยู่จะประเมินใหม่เมื่อมีคนกลับมา
- จบก่อนเฉลยไม่นับตาปัจจุบัน จบหลังเฉลยเก็บคะแนนแล้ว อันดับเสมอเป็น 1,1,3 ไม่ใช้ลำดับเข้าห้องตัดสินผู้ชนะ
- เล่นอีกเกม/กลับ Lobby คืนผู้เล่นและที่นั่งเดิม รีเซ็ตคะแนนและประวัติคำถาม

## 4. นำขึ้น Netlify

1. ให้โค้ดชุดนี้อยู่บน GitHub repository ก่อน
2. เข้าที่ https://app.netlify.com เลือก **Add new project → Import an existing project → GitHub → nakapo/Yesyou**
3. ตั้ง Build command เป็น `npm run build` และ Publish directory เป็น `dist` (มีใน `netlify.toml` แล้ว)
4. ที่ Environment variables เพิ่ม **VITE_SUPABASE_URL** และ **VITE_SUPABASE_PUBLISHABLE_KEY** ด้วยค่าเดียวกับ `.env` ไม่ใส่ secret key
5. กด Deploy รอให้สำเร็จ แล้วเปิด URL ที่ Netlify ให้
6. หากเพิ่มหรือเปลี่ยน environment variables ภายหลัง ต้อง Deploy ใหม่ เพราะ Vite ฝังค่าสองตัวนี้ตอน build
7. ให้เพื่อนเปิด URL นี้จากมือถือแต่ละคน สร้างวงและลองครบหนึ่งตาก่อนใช้จริง

ใช้ static SPA rewrite แล้ว จึง refresh หน้าเว็บได้ Supabase เป็น backend แยกจาก Netlify ไม่ต้องสร้าง Netlify Function เพิ่ม

## แก้/เพิ่มคำถาม

ข้อมูลอยู่ใน `src/questions.json` มี 498 ข้อจากเอกสารของผู้ใช้ (394 ข้อเริ่มต้น และ 104 ข้อแซ่บ/18+) ค่า `spice: 0` เป็นค่าเริ่มต้น `spice: 1` เปิดเมื่อ Host ยินยอม
รายละเอียดการนำเข้าจากเอกสาร การกำหนดช่วงเวลา 30 วัน และรายการที่แยกออก อยู่ใน [QUESTIONS.md](QUESTIONS.md)

แต่ละข้อมี `id`, `category`, `text`, `spice` ใช้ id ใหม่ที่ไม่ซ้ำ รักษาคำถาม YES/NO ประเด็นเดียว

หลังแก้ไฟล์:

```sh
npm run questions:sql
```

นำเนื้อหา `supabase/questions-upsert.sql` ไป Run ใน SQL Editor แล้ว deploy หน้าเว็บใหม่ เพื่อให้ Demo ใช้คลังเดียวกัน ต้องรัน migration 003 ก่อน คำสั่งนี้เพิ่ม/แก้ตาม id และปิด active ของข้อที่ถูกนำออกจาก JSON โดยเก็บแถวเดิมไว้ หากเพิ่มเนื้อหาใหม่ให้ใช้ id ใหม่ ส่วนการแก้ข้อความของ id เดิมควรทำนอกเกมที่กำลังเล่นเพื่อไม่เปลี่ยนคำถามกลางตา

## โครงสร้างและความปลอดภัย

- `src/main.tsx`: หน้าจอ React และ Demo ที่ไม่ติดต่อ backend
- `src/api.ts`: anonymous session และ RPC ไม่มี service key
- `src/game.ts`: ชนิดข้อมูลและการจัดอันดับ
- `src/Avatar.tsx`, `src/style.css`: illustration และ design tokens
- `supabase/migrations/`: schema, RLS, server actions และคำถาม
- `tests/`: unit, PostgreSQL integration และ online smoke test

ตารางจริงอยู่ schema `private` ปิดสิทธิ์อ่าน/เขียนจาก client และเปิด RLS แบบไม่มี public policy เฉพาะ security-definer RPC ที่ตรวจ `auth.uid()` จึงเข้าถึงได้ ห้ามเพิ่ม private schema เข้า Exposed schemas หรือเพิ่ม policy เปิดอ่านเอง

`game_view` คืนเฉพาะ question ของเจ้าของคำถาม/ตาที่เฉลยแล้ว และคืน guess ของตัวเอง/หลังเฉลยเท่านั้น Realtime เผยเฉพาะ `{room, version}` ให้สมาชิกห้องผ่าน RLS จากนั้น client ขอ snapshot ที่ผ่านสิทธิ์อีกครั้ง ไม่ broadcast คำถามหรือคำทาย

`game_action` ล็อกแถวห้อง (`FOR UPDATE`) ก่อนทุก action ให้การเฉลย/คะแนน atomic และป้องกัน race กับการจบเกม `votes` มี primary key ห้อง+ตา+ผู้เล่น ไม่ให้ส่งซ้ำหรือคิดคะแนนซ้ำ รหัสลับ hash ด้วย bcrypt มีการจำกัดการ join 12 ครั้ง/นาที/identity คืนข้อความทั่วไปเมื่อ code/secret ผิด ขีดจำกัดนี้ไม่แทนการป้องกันระดับ IP ของผู้ให้บริการ หากเปิดสาธารณะวงกว้างควรเพิ่ม gateway rate limiting

ตัวตนและ UUID ห้องอยู่ browser storage เพื่อ reconnect ไม่ได้ใช้ storage จำลอง multiplayer ตัวฐานข้อมูลเป็นแหล่งคะแนนและสถานะหลัก

## คำสั่งทดสอบ

```sh
npm test
npm run build
# ต้องมี Docker และ Python 3.12+ ใช้ฐานข้อมูลทิ้งหลังทดสอบ ไม่แตะ Supabase จริง
npm run test:database
# หลังตั้ง .env แล้ว ใช้ Supabase โปรเจกต์ทดสอบของตัวเอง จะสร้าง 3 anonymous users และห้องทดสอบจริง
node --env-file=.env tests/online.mjs
```

รายการตรวจผ่านมือถือและขอบเขตที่ยังไม่ได้ทดสอบอยู่ใน `TESTING.md`
