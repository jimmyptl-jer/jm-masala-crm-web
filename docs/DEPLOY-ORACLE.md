# Putting the app on a free Oracle Cloud server

One small server runs everything: the app (API, quote PDFs and the web screens) plus Caddy, which gives you the
`https://` address. The database stays on Supabase and the files stay in your S3 bucket, so the server holds nothing
that cannot be rebuilt.

Allow about an hour the first time. Every step says what you should see when it worked.

## 1. Create the Oracle account
1. Go to **cloud.oracle.com** and choose **Sign up**.
2. Pick the home region **India West (Mumbai)** or **India South (Hyderabad)**. It cannot be changed later.
3. A card is asked for to check your identity. The "Always Free" resources below are not charged.

## 2. Create the server
1. Menu → **Compute → Instances → Create instance**.
2. Image: **Canonical Ubuntu 22.04**. Shape: **Ampere (VM.Standard.A1.Flex)** with **1 OCPU and 6 GB** memory (inside the free limit).
   If it says "Out of capacity", try again later or try the other region.
3. Networking: keep the defaults and make sure **Assign a public IPv4 address** is on.
4. **Add SSH keys → Generate a key pair** and download the private key. Keep it safe; it is the only way in.
5. Create. When the status is **Running**, note the **Public IP address**.

## 3. Open the web ports
Oracle blocks everything by default, in two places.
1. **Cloud side:** Instance → the **Subnet** link → **Security Lists** → the default list → **Add Ingress Rules**:
   source `0.0.0.0/0`, protocol TCP, destination port `80`. Add a second rule for port `443`.
2. **Server side:** after you log in (step 5) run:
   ```
   sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
   sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
   ```

## 4. A free web address
1. Go to **duckdns.org**, sign in, and add a name, for example `jmmasala` (you get `jmmasala.duckdns.org`).
2. Put the server's **Public IP** in the "current ip" box and press **update ip**.
   (A real domain also works later: add an `A` record pointing to the same IP.)

## 5. Log in and install Docker
On your computer (PowerShell), with the key you downloaded:
```
ssh -i C:\path\to\ssh-key.key ubuntu@<PUBLIC IP>
```
Then on the server:
```
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```
Log in again with the same `ssh` command. `docker --version` should now print a version.

## 6. Get the code
The repository is private, so use a GitHub token (GitHub → Settings → Developer settings → Fine-grained token,
read-only access to `jm-masala-crm`):
```
git clone https://github.com/jimmyptl-jer/jm-masala-crm.git
cd jm-masala-crm
```
Use your GitHub user name and the token as the password.

## 7. Fill in the settings
```
cp deploy.env.example .env
nano .env
```
Fill in every empty value: `DOMAIN`, `PUBLIC_API_URL`, `CORS_ORIGINS` (your address), `DATABASE_URL`,
`AUTH_SECRET` (any long random text, 40+ characters), the S3 keys and `SMTP_PASS`. Save with Ctrl+O, Enter, Ctrl+X.

The `.env` file stays on the server only. It is never committed.

## 8. Start it
```
docker compose up -d --build
```
The first build takes 5 to 10 minutes. Then:
```
docker compose ps                # app and caddy should both say "running"
docker compose logs -f app       # should end with: API listening on :3000
```
Open `https://<your address>` in a browser. You should see the sign-in page with a padlock.

## 9. Check it works
1. Sign in.
2. Make a quote and press **Send** to your own e-mail address. The mail should arrive with the PDF attached.

## Updating later
After changes are pushed to GitHub:
```
cd jm-masala-crm
git pull
docker compose up -d --build
```

## Looking after it
* **Idle servers:** Oracle can stop a free server that sits almost idle for a long time. Use the app weekly, or
  ask me to add a small scheduled job that keeps it busy.
* **Back up the server once** (Instance → **More actions → Create boot volume backup**), so rebuilding is quick.
* **Data safety:** quotes and buyers live in Supabase, files in S3. Keep your Supabase and AWS accounts secure.
* **Passwords:** the sign-in passwords are fixed in the code (`api/src/services/simple-auth.ts`, as hashes). Change
  them before real customers' data is in the app.
* **Keys shown in chat:** rotate the database password, the S3 key and the Gmail app password, then update `.env` and run
  `docker compose up -d`.
