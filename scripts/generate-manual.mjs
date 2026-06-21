import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  TableOfContents, StyleLevel, PageBreak, NumberFormat, convertInchesToTwip,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  UnderlineType, LevelFormat, Header, Footer, PageNumber,
} from "docx";
import fs from "fs";
import path from "path";

const ACCENT = "1F3A6E";   // dark navy (lodge brand)
const LIGHT   = "3A5FA0";  // mid-blue
const SHADE   = "EEF2FA";  // very light blue for table rows
const WHITE   = "FFFFFF";
const BLACK   = "1A1A1A";
const GRAY    = "555555";
const RED_WARN = "8B1A1A";

// ── helpers ──────────────────────────────────────────────────────────────────

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 160 },
    border: { bottom: { style: BorderStyle.THICK, size: 6, color: ACCENT } },
    children: [
      new TextRun({ text, bold: true, size: 40, color: ACCENT, font: "Calibri" }),
    ],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 120 },
    children: [
      new TextRun({ text, bold: true, size: 32, color: LIGHT, font: "Calibri" }),
    ],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 80 },
    children: [
      new TextRun({ text, bold: true, size: 26, color: BLACK, font: "Calibri" }),
    ],
  });
}

function body(text, { bold = false, italic = false, color = BLACK, size = 24 } = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 100 },
    children: [
      new TextRun({ text, bold, italic, color, size, font: "Calibri" }),
    ],
  });
}

function tip(text) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: convertInchesToTwip(0.25) },
    shading: { type: ShadingType.CLEAR, fill: "E8F4E8" },
    border: { left: { style: BorderStyle.THICK, size: 6, color: "2D7D2D" } },
    children: [
      new TextRun({ text: "💡  TIP: ", bold: true, color: "2D7D2D", size: 22, font: "Calibri" }),
      new TextRun({ text, color: "1A3D1A", size: 22, font: "Calibri" }),
    ],
  });
}

function warning(text) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: convertInchesToTwip(0.25) },
    shading: { type: ShadingType.CLEAR, fill: "FFF3CD" },
    border: { left: { style: BorderStyle.THICK, size: 6, color: "B8860B" } },
    children: [
      new TextRun({ text: "⚠  IMPORTANT: ", bold: true, color: "7A5700", size: 22, font: "Calibri" }),
      new TextRun({ text, color: "4A3500", size: 22, font: "Calibri" }),
    ],
  });
}

function step(num, text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: convertInchesToTwip(0.5) },
    children: [
      new TextRun({ text: `Step ${num}:  `, bold: true, color: ACCENT, size: 24, font: "Calibri" }),
      new TextRun({ text, size: 24, font: "Calibri", color: BLACK }),
    ],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { before: 60, after: 60 },
    indent: { left: convertInchesToTwip(0.5 + level * 0.25) },
    children: [
      new TextRun({ text, size: 24, font: "Calibri", color: BLACK }),
    ],
  });
}

function note(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: convertInchesToTwip(0.25) },
    children: [
      new TextRun({ text: "Note: ", bold: true, italic: true, color: GRAY, size: 22, font: "Calibri" }),
      new TextRun({ text, italic: true, color: GRAY, size: 22, font: "Calibri" }),
    ],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function separator() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" } },
    children: [],
  });
}

function labeledRow(label, description) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 30, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: SHADE },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: 22, font: "Calibri", color: ACCENT })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 70, type: WidthType.PERCENTAGE },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: description, size: 22, font: "Calibri", color: BLACK })],
          }),
        ],
      }),
    ],
  });
}

function featureTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, desc]) => labeledRow(label, desc)),
    margins: { top: 80, bottom: 200, left: 0, right: 0 },
  });
}

// ── TITLE PAGE ──────────────────────────────────────────────────────────────

const titlePage = [
  new Paragraph({ spacing: { before: 2880 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    children: [
      new TextRun({
        text: "General John J. Pershing Lodge No. 307",
        bold: true, size: 52, color: ACCENT, font: "Calibri",
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 160 },
    children: [
      new TextRun({ text: "Member Portal", size: 40, color: LIGHT, font: "Calibri" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 600 },
    children: [
      new TextRun({
        text: "User & Administrator Manual",
        bold: true, size: 48, color: BLACK, font: "Calibri",
      }),
    ],
  }),
  separator(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 80 },
    children: [
      new TextRun({
        text: "Written in plain language for all members",
        italic: true, size: 26, color: GRAY, font: "Calibri",
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: `Revised: June 2026`, size: 22, color: GRAY, font: "Calibri" }),
    ],
  }),
  pageBreak(),
];

// ── HOW TO READ THIS MANUAL ──────────────────────────────────────────────────

const howToRead = [
  h1("How to Use This Manual"),
  body("This manual is written in plain, step-by-step language. You do not need any technical background to follow it."),
  body(""),
  h3("What You Will Find Here"),
  bullet("Part 1 — Member Guide: Everything a regular member needs to sign in, navigate the portal, update their profile, and find lodge information."),
  bullet("Part 2 — Administrator Guide: Instructions for lodge officers who manage the portal (adding members, sending invitations, editing content, and adjusting system settings)."),
  body(""),
  h3("Symbols Used in This Manual"),
  featureTable([
    ["💡  TIP", "A helpful suggestion that makes things easier."],
    ["⚠  IMPORTANT", "Something to pay close attention to — please read carefully."],
    ["Step 1, Step 2 …", "Follow numbered steps in order from top to bottom."],
    ["Bold text", "The name of a button, link, or page you need to click or find on screen."],
  ]),
  body(""),
  tip("If you are reading this on a computer, you can search for any word by pressing Ctrl + F (Windows) or Command + F (Mac) and typing what you are looking for."),
  pageBreak(),
];

// ── PART 1: MEMBER GUIDE ─────────────────────────────────────────────────────

const part1Cover = [
  new Paragraph({ spacing: { before: 1440 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    shading: { type: ShadingType.CLEAR, fill: ACCENT },
    children: [
      new TextRun({ text: "  PART 1  ", bold: true, size: 48, color: WHITE, font: "Calibri" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 80 },
    children: [
      new TextRun({ text: "Member Guide", bold: true, size: 52, color: ACCENT, font: "Calibri" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "For all lodge members — no technical experience needed",
        italic: true, size: 28, color: GRAY, font: "Calibri",
      }),
    ],
  }),
  pageBreak(),
];

// ── SECTION 1: GETTING STARTED ───────────────────────────────────────────────

const gettingStarted = [
  h1("Section 1 — Getting Started"),

  h2("1.1  What Is the Member Portal?"),
  body("The Member Portal is a secure, private website for lodge members only. You can use it to:"),
  bullet("See upcoming lodge meetings and social events."),
  bullet("View the member directory and birthday calendar."),
  bullet("Read and download lodge documents."),
  bullet("Check the lodge history and timeline."),
  bullet("Update your own personal information."),
  body(""),
  tip("The portal works on any device — a desktop computer, a laptop, a tablet, or a smartphone. You only need a web browser (such as Chrome, Edge, Firefox, or Safari)."),
  body(""),

  h2("1.2  Opening the Portal"),
  body("Your lodge administrator will give you the web address (also called a URL or link) for the portal. It will look something like:"),
  new Paragraph({
    spacing: { before: 80, after: 80 },
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "https://your-lodge-portal.replit.app",
        bold: true, size: 24, font: "Courier New", color: ACCENT,
      }),
    ],
  }),
  step(1, "Open your web browser."),
  step(2, "Click in the address bar at the very top of the browser window."),
  step(3, "Type (or paste) the portal address and press Enter on your keyboard."),
  step(4, "The Sign In page will appear."),
  body(""),

  h2("1.3  Your First-Time Invitation"),
  body("Before you can sign in, a lodge administrator must send you an invitation by email. Here is what to expect:"),
  step(1, "You will receive an email from the lodge with the subject line something like: 'You have been invited to the Member Portal.'"),
  step(2, "Open that email and click the large button or link that says Accept Invitation."),
  step(3, "A page will open in your web browser asking you to create your password."),
  step(4, "Choose a strong password. The page will show you exactly what your password needs (for example: at least 12 characters, a capital letter, a number, and a special symbol like ! or @)."),
  step(5, "Type the same password again in the Confirm Password box to make sure it matches."),
  step(6, "Click the Create Account button."),
  step(7, "You are now signed in and will be taken to the portal."),
  warning("Invitation links expire after a set number of days. If your link has expired, contact your lodge administrator and ask them to send a new one."),
  body(""),
  pageBreak(),

  h2("1.4  Signing In"),
  body("Each time you visit the portal, you will need to sign in with your email address and password."),
  step(1, "Go to the portal address in your web browser."),
  step(2, "Type your email address in the Email Address box."),
  step(3, "Type your password in the Password box. (Click the eye icon 👁 on the right side of the box if you want to see what you are typing.)"),
  step(4, "Click the Sign In button."),
  step(5, "If you have set up two-step verification (see Section 4.2), you will be asked for a 6-digit code from your phone. Enter it and click Verify."),
  tip("If you check the box that says Remember me, the portal will keep you signed in on that device for a longer time so you do not have to type your password every visit."),
  body(""),

  h2("1.5  Forgotten Password"),
  body("If you cannot remember your password, you can reset it easily."),
  step(1, "On the Sign In page, click the words Forgot password? — they appear in small text next to the Password box."),
  step(2, "Type your email address and click Send Reset Link."),
  step(3, "Check your email inbox. You will receive an email with a link to reset your password."),
  step(4, "Click that link. A page will open asking you to choose a new password."),
  step(5, "Type your new password, confirm it, and click Save New Password."),
  step(6, "You can now sign in with your new password."),
  warning("The password reset link expires after a short time (usually a few hours). If it has expired, simply go back to Forgot password? and request a new one."),
  body(""),

  h2("1.6  Signing Out"),
  body("When you are finished using the portal, it is good practice to sign out — especially on a shared computer."),
  step(1, "Look at the bottom of the left-side menu (the navigation bar)."),
  step(2, "Click Sign Out."),
  step(3, "You will be returned to the Sign In page."),
  tip("The portal will also sign you out automatically after a period of inactivity (for example, if you leave the browser open but unused for several hours)."),
  pageBreak(),
];

// ── SECTION 2: NAVIGATING THE PORTAL ────────────────────────────────────────

const navigation = [
  h1("Section 2 — Finding Your Way Around"),

  h2("2.1  The Navigation Menu"),
  body("Once you are signed in, you will see a menu on the left side of the screen. This is how you move between the different parts of the portal."),
  body("On a phone or small tablet, the menu may be hidden. Look for a small icon that looks like three horizontal lines (☰) in the top-left corner — tap it to open the menu."),
  body(""),
  featureTable([
    ["Dashboard", "Your home page. Shows a welcome message, upcoming meetings and events, member birthdays this month, and the portal roadmap."],
    ["Tracing Board", "The official lodge meeting schedule. See dates, times, and topics for upcoming degree work and Masonic education."],
    ["History", "The story of the lodge — timeline, historical documents, and a biography of General John J. Pershing."],
    ["Events", "Social events and gatherings hosted by the lodge (separate from regular meetings)."],
    ["Birthdays", "A monthly calendar showing member birthdays. A nice way to send a card or a message!"],
    ["Documents", "The lodge document library — forms, by-laws, newsletters, and other files you may need."],
    ["Settings", "Update your own profile, password, and security settings."],
  ]),
  body(""),
  note("Some menu items are only visible to members with a full membership status. If you just joined, some sections may not appear yet."),
  body(""),

  h2("2.2  The Dashboard (Home Page)"),
  body("The Dashboard is the first thing you see after signing in. Think of it as your personal bulletin board. It shows:"),
  bullet("A welcome message with your name and Masonic title."),
  bullet("Upcoming Tracing Board entries — the next lodge meetings at a glance."),
  bullet("Upcoming events — social gatherings happening soon."),
  bullet("Birthdays this month — members whose birthday falls this month."),
  bullet("Portal Roadmap — a list of features the technology team is working on."),
  tip("Check the Dashboard each time you visit — it is updated regularly with the latest lodge news."),
  pageBreak(),
];

// ── SECTION 3: MEMBER FEATURES ───────────────────────────────────────────────

const memberFeatures = [
  h1("Section 3 — Using the Portal Features"),

  h2("3.1  Tracing Board (Meeting Schedule)"),
  body("The Tracing Board page shows you the official schedule of lodge communications (meetings)."),
  step(1, "Click Tracing Board in the left menu."),
  step(2, "You will see a list of upcoming meetings. Each entry shows the date, type of meeting, and topic."),
  step(3, "You can switch between a List view and a Calendar view using the buttons near the top of the page."),
  note("Only administrators can add or edit Tracing Board entries. If something needs to be changed, contact your lodge secretary."),
  body(""),

  h2("3.2  Lodge History"),
  body("The History section contains the rich history of the lodge, broken into three areas:"),
  bullet("Timeline: Key events and milestones from the lodge's founding to today."),
  bullet("Historical Documents: Scanned charters, old photographs, and archival records."),
  bullet("General Pershing: A biography of General John J. Pershing, for whom the lodge is named."),
  body(""),
  step(1, "Click History in the left menu."),
  step(2, "Select the sub-section you want: Timeline, Historical Documents, or Pershing Bio."),
  body(""),

  h2("3.3  Events"),
  body("The Events page lists social gatherings, dinners, and special events hosted by the lodge."),
  step(1, "Click Events in the left menu."),
  step(2, "Browse the list of upcoming events. Each one shows the name, date, and a short description."),
  body(""),

  h2("3.4  Birthday Calendar"),
  body("The Birthday Calendar is a thoughtful feature that helps members keep in touch."),
  step(1, "Click Birthdays in the left menu."),
  step(2, "A monthly calendar appears. Days with a birthday are highlighted."),
  step(3, "Click on a highlighted day to see which member (or members) have a birthday that day."),
  tip("Only the day and month are shown — the year (age) is kept private."),
  note("You can control whether your own birthday appears to other members. See Section 4.1 — Profile Settings."),
  body(""),

  h2("3.5  Document Library"),
  body("The Document Library gives you access to files the lodge has made available to members."),
  step(1, "Click Documents in the left menu."),
  step(2, "You will see a list of folders (called Domains), such as General, Ritual, or Past Masters."),
  step(3, "Click on a folder to open it and see the files inside."),
  step(4, "Click on a file name to open or download it."),
  warning("Some folders may be restricted to certain roles. If you cannot see a folder you expect to access, contact your lodge administrator."),
  body(""),
  pageBreak(),
];

// ── SECTION 4: SETTINGS ──────────────────────────────────────────────────────

const memberSettings = [
  h1("Section 4 — Your Personal Settings"),
  body("The Settings area lets you update your own information and manage your account security. You can find it in the left menu under Settings."),
  body(""),

  h2("4.1  Profile Settings"),
  body("Here you can update your personal details."),
  step(1, "Click Settings in the left menu, then choose Profile."),
  step(2, "You can update the following fields:"),
  bullet("First Name and Last Name"),
  bullet("Display Name (the name shown to other members)"),
  bullet("Email Address"),
  bullet("Date of Birth (used for the Birthday Calendar)"),
  bullet("Birthday Visibility — choose whether your birthday is shown to other members, or kept private."),
  step(3, "After making changes, click the Save Changes button."),
  tip("Your email address is also your sign-in name. If you change it, use the new address when you next sign in."),
  body(""),

  h2("4.2  Changing Your Password"),
  body("It is a good habit to update your password regularly."),
  step(1, "Click Settings, then choose Security or Password (depending on your menu)."),
  step(2, "Type your current password in the Current Password box."),
  step(3, "Type your new password in the New Password box. A checklist will appear showing whether your new password meets the requirements."),
  step(4, "Type the new password again in the Confirm New Password box."),
  step(5, "Click Save New Password."),
  warning("You cannot reuse a recent password. If the page shows an error saying that password was used recently, choose a different one."),
  body(""),

  h2("4.3  Two-Step Verification (2FA)"),
  body("Two-step verification adds an extra layer of security to your account. When it is turned on, you need both your password AND a 6-digit code from your phone to sign in. This makes it much harder for anyone else to access your account."),
  body(""),
  h3("Setting Up Two-Step Verification"),
  body("You will need a free app on your smartphone. The most commonly used ones are:"),
  bullet("Google Authenticator (available in your phone's app store)"),
  bullet("Microsoft Authenticator"),
  bullet("Authy"),
  body(""),
  step(1, "Click Settings, then choose 2-Step Verification."),
  step(2, "Click the Set Up button."),
  step(3, "Open your authenticator app on your phone and scan the square barcode (called a QR code) shown on screen."),
  step(4, "The app will now show a 6-digit number that changes every 30 seconds."),
  step(5, "Type the current 6-digit number into the box on the portal page and click Verify."),
  step(6, "Two-step verification is now active."),
  tip("After setting up 2FA, the portal will show you a set of Backup Codes. Save these in a safe place (print them out or write them down). If you ever lose your phone, a backup code will let you get back in."),
  warning("If you lose access to your authenticator app and do not have backup codes, contact your lodge administrator. They can disable 2FA on your account so you can sign in again."),
  body(""),

  h2("4.4  Passkeys (Advanced Sign-In Option)"),
  body("A passkey is a modern, very secure way to sign in without typing a password. Instead, it uses your device's built-in security — such as your fingerprint, Face ID, Windows Hello, or your device PIN."),
  body(""),
  note("Passkeys may not be enabled on your portal yet. If you do not see this option, the feature is not currently active. Your administrator can enable it under the Authentication settings."),
  body(""),
  h3("Registering a Passkey"),
  step(1, "Click Settings, then choose Passkeys."),
  step(2, "Give your passkey a name (for example, 'My iPhone' or 'Home Laptop') so you can tell them apart."),
  step(3, "Click Add Passkey."),
  step(4, "Your device will prompt you to authenticate — use your fingerprint, face, or PIN as instructed on screen."),
  step(5, "The passkey is now saved. Next time you sign in, you can choose to use your passkey instead of your password."),
  body(""),
  h3("Removing a Passkey"),
  step(1, "Click Settings, then choose Passkeys."),
  step(2, "Find the passkey you want to remove in the list."),
  step(3, "Click the red trash icon 🗑 next to it."),
  step(4, "Confirm the deletion."),
  tip("If you get a new phone or computer, register a new passkey on it first, then remove the old one."),
  pageBreak(),
];

// ── PART 2: ADMINISTRATOR GUIDE ──────────────────────────────────────────────

const part2Cover = [
  new Paragraph({ spacing: { before: 1440 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    shading: { type: ShadingType.CLEAR, fill: ACCENT },
    children: [
      new TextRun({ text: "  PART 2  ", bold: true, size: 48, color: WHITE, font: "Calibri" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 80 },
    children: [
      new TextRun({ text: "Administrator Guide", bold: true, size: 52, color: ACCENT, font: "Calibri" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "For lodge officers and portal administrators only",
        italic: true, size: 28, color: GRAY, font: "Calibri",
      }),
    ],
  }),
  pageBreak(),
];

// ── SECTION 5: ADMIN OVERVIEW ────────────────────────────────────────────────

const adminOverview = [
  h1("Section 5 — Administrator Overview"),

  h2("5.1  Who Is an Administrator?"),
  body("An Administrator is a lodge member who has been granted special permissions to manage the portal. Typically this is the lodge Secretary, Webmaster, or a designated officer."),
  body("As an Administrator, you will see an extra section in the left menu called Management. This is where all the administrative tools are located."),
  body(""),
  featureTable([
    ["Members", "Add new members, edit profiles, assign roles, and deactivate or remove accounts."],
    ["Invitations", "View and manage pending invitations that have been sent to new members."],
    ["Roles & Degrees", "Define the lodge officer roles and Masonic degree titles used throughout the portal."],
    ["Document Domains", "Create categories (called Domains) that organise the document library."],
    ["Docs Management", "Upload files and manage the folder structure inside each Domain."],
    ["Document Review", "Approve or reject documents uploaded by members before they are published."],
    ["Tracing Board", "Add, edit, or remove meeting entries on the lodge meeting schedule."],
    ["Events Admin", "Create and manage social events."],
    ["History Admin", "Edit the lodge history pages, add timeline entries, and upload historical documents."],
    ["Roadmap", "Update the status of items on the portal development roadmap."],
    ["Reports", "View membership reports, birthday lists, onboarding status, and document access logs."],
    ["Configuration", "Change system-wide settings — lodge name, email configuration, password rules, and security policies."],
    ["Audit Log", "A complete, tamper-evident record of everything that happens in the portal."],
  ]),
  body(""),
  warning("Administrative actions are powerful. Every change you make is recorded in the Audit Log with your name and the date and time. Always double-check before deleting anything — most deletions cannot be undone."),
  pageBreak(),
];

// ── SECTION 6: MANAGING MEMBERS ──────────────────────────────────────────────

const managingMembers = [
  h1("Section 6 — Managing Members"),

  h2("6.1  Viewing the Member List"),
  step(1, "Click Management in the left menu, then choose Members."),
  step(2, "You will see a table listing all members. Each row shows the member's name, email address, role, and status (Active, Inactive, or Pending)."),
  step(3, "Use the search box at the top to find a specific member by name or email."),
  body(""),

  h2("6.2  Sending an Invitation to a New Member"),
  body("New members do not create their own accounts. You must send them an invitation first."),
  step(1, "Click Management, then choose Members."),
  step(2, "Click the Invite Member button (usually at the top right of the page)."),
  step(3, "Enter the new member's email address."),
  step(4, "Select the appropriate Role from the drop-down list (e.g., Member, Past Master)."),
  step(5, "Click Send Invitation."),
  step(6, "The new member will receive an email with a link to set up their account."),
  tip("You can check whether the invitation has been accepted by clicking Management → Invitations. Pending invitations are shown there."),
  note("Invitation links expire after a set number of days (configurable by an administrator). If the member does not receive the email, ask them to check their spam or junk folder."),
  body(""),

  h2("6.3  Editing a Member's Profile"),
  step(1, "In the Members list, find the member and click their name or the Edit button on their row."),
  step(2, "You can update:"),
  bullet("First name, last name, and display name"),
  bullet("Email address"),
  bullet("Date of birth (for the birthday calendar)"),
  bullet("Role assignment (e.g., Senior Warden, Fellow Craft)"),
  bullet("Membership status (Active or Inactive)"),
  step(3, "Click Save Changes when you are done."),
  body(""),

  h2("6.4  Deactivating or Removing a Member"),
  body("When a member is no longer active in the lodge, you have two choices:"),
  bullet("Deactivate: The account is kept but the member cannot sign in. This is the safest option and preserves their history."),
  bullet("Delete: The account is permanently removed. Use this only when absolutely necessary."),
  body(""),
  h3("To Deactivate a Member"),
  step(1, "In the Members list, find the member."),
  step(2, "Click Edit on their row."),
  step(3, "Change their Status to Inactive."),
  step(4, "Click Save Changes."),
  body(""),
  h3("To Delete a Member"),
  step(1, "In the Members list, find the member."),
  step(2, "Click the Delete button (usually shown as a red trash icon 🗑)."),
  step(3, "A warning box will appear asking you to confirm. Read it carefully."),
  step(4, "Type the confirmation text as instructed (usually the member's name or the word DELETE) and click Confirm."),
  warning("Deleting a member is permanent. Their account, profile information, and activity records will be removed. This action cannot be undone."),
  body(""),

  h2("6.5  Managing Pending Invitations"),
  step(1, "Click Management, then choose Invitations."),
  step(2, "You will see a list of invitations that have been sent but not yet accepted."),
  step(3, "If an invitation has expired, you can click Resend to send a fresh link to that person."),
  step(4, "To cancel an invitation, click the Delete (🗑) button next to it."),
  pageBreak(),
];

// ── SECTION 7: ROLES & DEGREES ───────────────────────────────────────────────

const rolesDegrees = [
  h1("Section 7 — Roles and Degrees"),

  h2("7.1  What Are Roles and Degrees?"),
  body("Roles are the officer positions in the lodge (for example: Worshipful Master, Senior Warden, Secretary). Degrees are the Masonic degrees a member has received (for example: Entered Apprentice, Fellowcraft, Master Mason)."),
  body("Both roles and degrees appear on member profiles and are used to control which documents and content each member can access."),
  body(""),

  h2("7.2  Viewing and Editing Roles"),
  step(1, "Click Management, then choose Roles & Degrees."),
  step(2, "The page is divided into two sections: Roles at the top, and Degrees below."),
  step(3, "To edit an existing role or degree, click the Edit (pencil ✏) icon next to it."),
  step(4, "To add a new role, click the Add Role button. Enter the role name and click Save."),
  step(5, "To remove a role, click the Delete (🗑) icon. You will be asked to confirm."),
  warning("If you delete a role that is currently assigned to members, those members will lose that role assignment. Make sure the role is no longer in use before deleting it."),
  pageBreak(),
];

// ── SECTION 8: DOCUMENTS ─────────────────────────────────────────────────────

const documentsAdmin = [
  h1("Section 8 — Managing Documents"),

  h2("8.1  How Documents Are Organised"),
  body("The document library is organised into Domains. Think of a Domain as a locked filing cabinet. Each Domain can have different access rules — for example, the 'Ritual' Domain might only be visible to Master Masons, while the 'General' Domain is open to all members."),
  body("Inside each Domain, there are Folders (and sub-folders), just like folders on your computer."),
  body(""),

  h2("8.2  Creating a New Domain"),
  step(1, "Click Management, then choose Document Domains."),
  step(2, "Click the Create Domain button."),
  step(3, "Enter a name for the Domain (e.g., 'Past Masters Resources')."),
  step(4, "Set the access rules — decide which roles and degrees can view, upload, or manage files in this Domain."),
  step(5, "Click Save."),
  body(""),

  h2("8.3  Uploading Files"),
  step(1, "Click Management, then choose Docs Management."),
  step(2, "Navigate to the folder where you want to upload the file."),
  step(3, "Click the Upload button."),
  step(4, "A window will open. Click Browse (or Choose File) and find the file on your computer."),
  step(5, "Select the file and click Open (or OK)."),
  step(6, "Click Upload to send the file to the portal."),
  tip("You can upload PDF files, Word documents, images, and other common file types. Very large files (over 50 MB) may take a moment."),
  body(""),

  h2("8.4  Document Review Queue"),
  body("If your portal is set up to allow members to upload files, those files go into a review queue before they are published. This lets you check the content before it is visible to everyone."),
  step(1, "Click Management, then choose Document Review."),
  step(2, "You will see a list of files waiting for review."),
  step(3, "Click on a file name to preview it."),
  step(4, "Click Approve to publish the file, or Reject to decline it (you can add a note explaining why)."),
  pageBreak(),
];

// ── SECTION 9: CONTENT ───────────────────────────────────────────────────────

const contentAdmin = [
  h1("Section 9 — Managing Content"),

  h2("9.1  Tracing Board (Meeting Schedule)"),
  body("You can add, edit, and remove entries on the lodge meeting schedule."),
  step(1, "Click Management, then choose Tracing Board."),
  step(2, "To add a new entry, click Add Entry."),
  step(3, "Fill in the details: date, type of meeting (e.g., Stated Communication, Degree Work), and a description."),
  step(4, "Click Save."),
  step(5, "To edit an existing entry, click the Edit ✏ icon on its row."),
  step(6, "To delete an entry, click the Delete 🗑 icon and confirm."),
  body(""),

  h2("9.2  Events"),
  step(1, "Click Management, then choose Events Admin."),
  step(2, "Click Add Event to create a new social event."),
  step(3, "Enter the event name, date, time, location, and a description."),
  step(4, "Click Save Event."),
  body(""),

  h2("9.3  Lodge History"),
  body("The History section has three parts you can edit: the main history page, the timeline, and the historical documents."),
  step(1, "Click Management, then choose History Admin."),
  step(2, "Use the tabs to switch between History Overview, Timeline, and Historical Documents."),
  step(3, "Click Edit ✏ on any entry to update it, or Add Entry to create a new one."),
  body(""),

  h2("9.4  Portal Roadmap"),
  body("The Roadmap shows members what features are being developed for the portal. You can update the status of each item."),
  step(1, "Click Management, then choose Roadmap."),
  step(2, "Each item shows a title, description, and status (Planned, In Progress, or Completed)."),
  step(3, "Click Edit ✏ to change the status or update the description."),
  pageBreak(),
];

// ── SECTION 10: REPORTS ──────────────────────────────────────────────────────

const reportsAdmin = [
  h1("Section 10 — Reports"),
  body("The Reports section gives you useful summaries and data about lodge membership and activity."),
  body(""),
  featureTable([
    ["Member Roster", "A full list of all members with their roles, degrees, and status. Useful for official records."],
    ["Birthday Report", "A list of all member birthdays sorted by month. Handy for sending cards."],
    ["Onboarding Status", "Shows which newly invited members have completed their account setup."],
    ["Document Access", "Shows which members have access to each document domain."],
  ]),
  body(""),
  step(1, "Click Management, then choose Reports."),
  step(2, "Select the report you want from the list."),
  step(3, "The data will load on screen. Look for a Download or Export button if you need to save the report as a file."),
  pageBreak(),
];

// ── SECTION 11: CONFIGURATION ────────────────────────────────────────────────

const configAdmin = [
  h1("Section 11 — System Configuration"),
  body("The Configuration page is where you adjust the overall settings of the portal. Changes here affect every member."),
  body(""),
  warning("Be careful on this page. Changes you make take effect immediately for all members. When in doubt, leave a setting as it is and consult your technology officer first."),
  body(""),

  h2("11.1  Lodge Information"),
  featureTable([
    ["Lodge Name", "The official name of the lodge as it appears in the portal header and emails."],
    ["Lodge Number", "The lodge number (e.g., 307)."],
  ]),
  step(1, "Click the Edit button next to the setting you want to change."),
  step(2, "Type the new value."),
  step(3, "Click Save."),
  body(""),

  h2("11.2  Email (SMTP) Settings"),
  body("These settings tell the portal how to send emails (invitations, password resets, notifications)."),
  featureTable([
    ["SMTP Host", "The address of the email server (provided by your email service)."],
    ["SMTP Port", "Usually 587 or 465. Your email provider will tell you which to use."],
    ["SMTP Username", "The email account username used to send mail."],
    ["From Address", "The email address members will see in the From field of emails they receive."],
    ["From Name", "The display name members will see (e.g., 'Pershing Lodge No. 307')."],
  ]),
  tip("After setting up or changing the SMTP settings, use the Send Test Email section at the bottom of the Configuration page to make sure emails are working correctly."),
  body(""),

  h2("11.3  Security Settings"),
  featureTable([
    ["Session Timeout", "How many minutes of inactivity before a member is automatically signed out."],
    ["Account Lockout", "How many failed sign-in attempts are allowed before an account is temporarily locked."],
    ["Require 2-Step Verification", "Whether members with certain roles must use two-step verification."],
    ["Invite Expiry Days", "How many days an invitation link remains valid before it expires."],
    ["Password Reset Expiry", "How many hours a password reset link remains valid."],
    ["Member Inactivity Period", "How many months without a sign-in before a member is marked as Inactive."],
  ]),
  body(""),

  h2("11.4  Authentication Settings"),
  featureTable([
    ["Enable Passkeys", "Turn on or off the ability for members to use passkeys (fingerprint/Face ID) to sign in. Leave this off until your portal is running on its permanent, stable web address."],
  ]),
  body(""),

  h2("11.5  Password Policy"),
  body("These settings control what counts as a valid password for all members."),
  featureTable([
    ["Minimum Length", "The shortest allowed password (e.g., 12 characters). Drag the slider or type a number between 8 and 32."],
    ["Require Uppercase Letter", "When turned on, passwords must include at least one capital letter (A–Z)."],
    ["Require Lowercase Letter", "When turned on, passwords must include at least one small letter (a–z)."],
    ["Require Number", "When turned on, passwords must include at least one digit (0–9)."],
    ["Require Special Character", "When turned on, passwords must include at least one symbol such as ! @ # $ % & *."],
    ["Prevent Password Reuse", "When turned on, members cannot reuse a recent password when changing it."],
    ["Password History Count", "How many previous passwords to remember and block from reuse."],
  ]),
  tip("The password policy is shown live to members as they type a new password — they will see a checklist of requirements turning green as they are met."),
  pageBreak(),
];

// ── SECTION 12: AUDIT LOG ─────────────────────────────────────────────────────

const auditLog = [
  h1("Section 12 — The Audit Log"),
  body("The Audit Log is a permanent, detailed record of everything that happens in the portal. It records who did what, and when."),
  body(""),

  h2("12.1  What Is Recorded?"),
  bullet("Sign-ins and sign-outs (successful and failed)"),
  bullet("Password changes and resets"),
  bullet("New member invitations and account creations"),
  bullet("Profile edits"),
  bullet("Document uploads, approvals, and deletions"),
  bullet("Administrative changes (configuration edits, role changes, etc.)"),
  bullet("Account lockouts"),
  body(""),

  h2("12.2  Viewing the Audit Log"),
  step(1, "Click Management, then choose Audit Log."),
  step(2, "A list of recent events appears, with the newest at the top."),
  step(3, "Each entry shows: the date and time, the member's name, what action they took, and any relevant details."),
  step(4, "Use the filter or search tools at the top to narrow down the results (for example, search by a member's name or by action type)."),
  tip("The Audit Log is your first resource when investigating a problem. If a member reports they cannot sign in, or if you notice something unusual, check the Audit Log first."),
  warning("The Audit Log is read-only. No one can edit or delete entries — this is by design, to ensure a trustworthy record of all activity."),
  pageBreak(),
];

// ── SECTION 13: TROUBLESHOOTING ───────────────────────────────────────────────

const troubleshooting = [
  h1("Section 13 — Common Problems and Solutions"),
  body("This section covers the most common questions members ask."),
  body(""),

  h2("For Members"),
  body(""),
  h3("I forgot my password."),
  body("Go to the Sign In page and click Forgot password?. Enter your email address and you will receive a reset link. See Section 1.5 for full details."),
  body(""),
  h3("I did not receive my invitation email."),
  body("Check your spam or junk email folder. If it is not there, contact your lodge administrator and ask them to resend the invitation (Management → Invitations → Resend)."),
  body(""),
  h3("My invitation link says it has expired."),
  body("Invitation links expire after a set number of days. Contact your administrator and ask them to send a new invitation."),
  body(""),
  h3("I am locked out of my account."),
  body("Too many wrong password attempts can temporarily lock your account. Wait 15 minutes and try again. If it remains locked, contact your administrator."),
  body(""),
  h3("I lost my phone and cannot get my two-step verification code."),
  body("If you saved your backup codes (see Section 4.3), use one of those to sign in. If not, contact your administrator — they can disable 2FA on your account from the Members management page."),
  body(""),
  h3("I cannot see a document or a folder I expected to access."),
  body("Some documents are restricted by role or degree. Contact your administrator to check your access level."),
  body(""),

  h2("For Administrators"),
  body(""),
  h3("A member is not receiving any emails from the portal."),
  body("Check the SMTP settings in Configuration (Management → Configuration → Email Settings). Use the Send Test Email tool to verify the email system is working. Also ask the member to check their spam folder."),
  body(""),
  h3("A member cannot sign in even though their account is active."),
  body("Check the Audit Log (Management → Audit Log) and search for that member's name. Look for any lockout or failed login entries. You may need to reset their account status or help them reset their password."),
  body(""),
  h3("I accidentally deleted something."),
  body("Most deletions in the portal are permanent. This is why the portal always asks you to confirm before deleting. If critical data was lost, contact your technology officer to check if a backup is available."),
  body(""),
  h3("I need to see what changes were made to the system."),
  body("Open the Audit Log (Management → Audit Log). Every configuration change, profile edit, and deletion is recorded there with the date, time, and the name of the person who made the change."),
  pageBreak(),
];

// ── SECTION 14: QUICK REFERENCE ──────────────────────────────────────────────

const quickRef = [
  h1("Section 14 — Quick Reference Card"),
  body("Cut out or print this page and keep it handy."),
  body(""),

  h2("Most Common Actions for Members"),
  featureTable([
    ["Sign In", "Go to the portal address → type email and password → click Sign In."],
    ["Forgot Password", "Sign In page → Forgot password? → enter email → check email for reset link."],
    ["Update Profile", "Left menu → Settings → Profile → make changes → Save Changes."],
    ["Change Password", "Left menu → Settings → Security → enter current password and new password → Save."],
    ["View Meetings", "Left menu → Tracing Board."],
    ["View Events", "Left menu → Events."],
    ["View Documents", "Left menu → Documents → choose a folder → click a file."],
    ["Sign Out", "Bottom of left menu → Sign Out."],
  ]),
  body(""),

  h2("Most Common Actions for Administrators"),
  featureTable([
    ["Invite a New Member", "Management → Members → Invite Member → enter email and role → Send Invitation."],
    ["Edit a Member", "Management → Members → find member → Edit → make changes → Save."],
    ["Check Pending Invitations", "Management → Invitations."],
    ["Upload a Document", "Management → Docs Management → navigate to folder → Upload."],
    ["Add a Meeting", "Management → Tracing Board → Add Entry → fill in details → Save."],
    ["Change System Settings", "Management → Configuration → find the setting → Edit → type new value → Save."],
    ["Check the Audit Log", "Management → Audit Log → search or scroll."],
    ["Run a Report", "Management → Reports → choose a report."],
  ]),
  body(""),

  separator(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 80 },
    children: [
      new TextRun({
        text: "General John J. Pershing Lodge No. 307  —  Member Portal Manual",
        italic: true, size: 20, color: GRAY, font: "Calibri",
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "For assistance, contact your lodge administrator.",
        italic: true, size: 20, color: GRAY, font: "Calibri",
      }),
    ],
  }),
];

// ── ASSEMBLE DOCUMENT ─────────────────────────────────────────────────────────

const doc = new Document({
  creator: "Pershing No. 307 Member Portal",
  title: "Member Portal — User & Administrator Manual",
  description: "Full user and administrator manual for the Pershing Lodge No. 307 Member Portal.",
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 24, color: BLACK },
        paragraph: { spacing: { line: 320 } },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.25),
            right: convertInchesToTwip(1.25),
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" } },
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: "Pershing No. 307 — Member Portal Manual",
                  size: 18, color: GRAY, font: "Calibri",
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" } },
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
                  size: 18, color: GRAY, font: "Calibri",
                }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...titlePage,
        ...howToRead,
        ...part1Cover,
        ...gettingStarted,
        ...navigation,
        ...memberFeatures,
        ...memberSettings,
        ...part2Cover,
        ...adminOverview,
        ...managingMembers,
        ...rolesDegrees,
        ...documentsAdmin,
        ...contentAdmin,
        ...reportsAdmin,
        ...configAdmin,
        ...auditLog,
        ...troubleshooting,
        ...quickRef,
      ],
    },
  ],
});

const outPath = path.resolve("Pershing307_Member_Portal_Manual.docx");
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);
console.log("✅  Written:", outPath, `(${(buffer.length / 1024).toFixed(0)} KB)`);
