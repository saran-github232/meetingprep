/** Experience-level options shared by the Prep Room setup and Mock Interview. */
export const EXPERIENCE_LEVELS = ["Entry-level", "Mid-level", "Senior", "Lead/Staff"];

/** Settings keys the Prep Room persists so its setup survives restarts and prefills Mock Interview. */
export const PREP_SETTING_KEYS = {
  role: "prep_role",
  skills: "prep_skills",
  experience: "prep_experience",
  jobDescription: "prep_jd",
  pack: "prep_pack_json",
} as const;
