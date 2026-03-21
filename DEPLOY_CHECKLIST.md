# Deploy checklist (mỗi lần cập nhật production)

Dùng tài liệu này để deploy nhanh và hạn chế sót bước.

## 1) Trước khi deploy

- [ ] Đang đứng tại root repo `CogniMail`
- [ ] Đã pull code mới nhất
- [ ] Đã kiểm tra env cần thiết
- [ ] Không commit file nhạy cảm (`.env`, service-account json)

## 2) Kiểm tra build local

```bash
npm install
npm run build
```

Nếu build lỗi: fix xong mới deploy.

## 3) Deploy Backend API (Vercel)

```bash
cd apps/backend-api
vercel deploy --prod
```

Checklist backend:
- [ ] Vercel project root = `apps/backend-api`
- [ ] Env trên Vercel đầy đủ
- [ ] Test endpoint `/config`, `/emails` sau deploy

## 4) Deploy Frontend (Firebase Hosting)

Quay về root repo:
```bash
cd ../..
npm --prefix apps/frontend run build
firebase deploy --only hosting
```

Checklist frontend:
- [ ] `firebase.json` trỏ `apps/frontend/out`
- [ ] Vào web production kiểm tra đăng nhập
- [ ] Test fetch email, test AI, test Calendar/Task

## 5) Worker local (nếu có update worker)

Nếu có thay đổi trong `apps/backend-worker`:
- [ ] Build/đóng gói lại worker
- [ ] Phát hành bản mới cho người dùng nội bộ
- [ ] Test tray + `/health` + `/configure` + `/sync-now`

## 6) Sau deploy

- [ ] Kiểm tra logs backend Vercel
- [ ] Kiểm tra console frontend (không có lỗi đỏ nghiêm trọng)
- [ ] Kiểm tra Firestore có dữ liệu mới đúng user
- [ ] Kiểm tra tác vụ AI và Task mapping đúng email

## 7) Rollback nhanh (nếu lỗi production)

- Frontend Firebase: rollback release trên Firebase Hosting
- Backend Vercel: promote deployment trước đó hoặc redeploy commit cũ

## 8) Lệnh Git chuẩn trước khi release

```bash
git status
git add .
git commit -m "feat/fix: <noi dung>"
git push origin main
```

---

Mẹo:
- Mỗi lần deploy xong, ghi ngắn vào changelog nội bộ: ngày giờ, commit, ai deploy, có gì thay đổi.
