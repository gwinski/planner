// Default timetable, inserted once into your own "blocks" table.
const t = (s: string) => {
  const [a, b] = s.split(":");
  return +a * 60 + +b;
};
const UNTIL = "2027-01-15";
const mk = (category: string, title: string, weekdays: number[], s: string, e: string, location: string | null = null) => ({
  title, category, weekdays, start_min: t(s), end_min: t(e), location, valid_until: UNTIL,
});
const cls = (title: string, d: number[], s: string, e: string, room = "Room 277") => mk("class", title, d, s, e, room);
const read = (title: string, d: number[], s: string, e: string, note: string) => mk("read", title, d, s, e, note);

// weekdays: 0=Sun ... 6=Sat
export const SEED = [
  cls("MME 412 Electrochemistry", [1], "10:00", "12:00"),
  cls("MEG 412 Refrigeration & A/C", [1], "12:00", "14:00"),
  cls("GEG 411 Technical Comm.", [2], "10:00", "11:00"),
  cls("MEG 415 Product Eng. Design", [2], "10:00", "12:00"),
  cls("MEG 414 Structural Dynamics", [2], "12:00", "14:00"),
  cls("MEG 433 Turbomachinery", [2], "15:00", "17:00"),
  cls("MEG 413 Mech Eng Lab IV", [3], "09:00", "12:00", "Laboratory"),
  cls("MEG 417 Heat & Mass Transfer", [3], "12:00", "14:00", "Room 271"),
  cls("MEG 415 Product Eng. Design", [4], "09:00", "10:00"),
  cls("MEG 417 Heat & Mass Transfer", [4], "10:00", "11:00"),
  cls("MEG 412 Refrigeration & A/C", [4], "14:00", "15:00"),
  cls("MEG 416 Continuum Mech. II", [5], "09:00", "11:00"),
  read("Pre-read: MME 412", [0], "19:00", "19:40", "For Monday"),
  read("Pre-read: MEG 412", [0], "19:50", "20:30", "For Monday"),
  read("Pre-read: MEG 415", [1], "19:00", "19:40", "For Tuesday"),
  read("Pre-read: GEG 411", [1], "19:50", "20:20", "For Tuesday"),
  read("Pre-read: MEG 414", [2], "08:30", "09:10", "Before 12pm class"),
  read("Pre-read: MEG 433", [2], "14:15", "14:50", "Before 3pm class"),
  read("Pre-read: MEG 413 lab manual", [2], "19:00", "19:40", "For Wednesday lab"),
  read("Pre-read: MEG 417", [2], "19:50", "20:30", "For Wednesday"),
  read("Recap: MEG 415", [3], "19:00", "19:40", "For Thursday"),
  read("Recap: MEG 417", [3], "19:50", "20:20", "For Thursday"),
  read("Pre-read: MEG 412", [4], "12:00", "12:30", "Before 2pm class"),
  read("Pre-read: MEG 416", [4], "19:00", "19:40", "For Friday"),
];

const rev = (n: number, s: string, e: string) => ({
  ...mk("read", `Revision block ${n}`, [1, 2, 3, 4, 5, 6], s, e, "Rename once your exam timetable is out"),
  valid_from: "2027-01-18",
  valid_until: "2027-02-12",
});

export const REVISION = [rev(1, "09:00", "12:00"), rev(2, "14:00", "17:00")];
