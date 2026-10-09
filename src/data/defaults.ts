import type { Equipment, LiftGroup, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  bodyWeight: 180,
  bodyUnit: "lb",
  liftUnit: "lb",
  restSec: 90,
  restMode: "fixed",
  calorieMode: "net",
  eatBackPct: 50,
  defaultPool: "25m",
  forgotFinishHours: 4,
  sheetId: null,
};

export interface BuiltInExercise {
  name: string;
  group: LiftGroup;
  equipment: Equipment;
  count: 1 | 2;
}

const x = (name: string, group: LiftGroup, equipment: Equipment, count: 1 | 2 = 1): BuiltInExercise => ({
  name, group, equipment, count,
});

/** SPEC §12. Dumbbell defaults to a pair unless stated. */
export const BUILT_IN_EXERCISES: BuiltInExercise[] = [
  x("Bicep curl", "arms", "dumbbell", 2),
  x("Hammer curl", "arms", "dumbbell", 2),
  x("Preacher curl", "arms", "machine"),
  x("Tricep extension", "arms", "dumbbell", 1),
  x("Tricep pushdown", "arms", "cable"),
  x("Dips", "arms", "bodyweight"),

  x("Shoulder press", "upper", "dumbbell", 2),
  x("Lateral raise", "upper", "dumbbell", 2),
  x("Front raise", "upper", "dumbbell", 2),
  x("Rear delt fly", "upper", "machine"),
  x("Chest press", "upper", "machine"),
  x("Bench press", "upper", "barbell"),
  x("Incline press", "upper", "dumbbell", 2),
  x("Chest fly", "upper", "machine"),
  x("Push-up", "upper", "bodyweight"),
  x("Row", "upper", "cable"),
  x("Lat pulldown", "upper", "cable"),
  x("Pull-up", "upper", "bodyweight"),
  x("Face pull", "upper", "cable"),
  x("Pallof press", "upper", "cable"),
  x("Cable crunch", "upper", "cable"),
  x("Russian twist", "upper", "bodyweight"),

  x("Squat", "legs", "barbell"),
  x("Deadlift", "legs", "barbell"),
  x("Romanian deadlift", "legs", "barbell"),
  x("Leg press", "legs", "machine"),
  x("Lunge", "legs", "dumbbell", 2),
  x("Leg curl", "legs", "machine"),
  x("Leg extension", "legs", "machine"),
  x("Hip thrust", "legs", "barbell"),
  x("Calf raise", "legs", "machine"),
];

export const GROUP_LABEL = { arms: "Arms", upper: "Upper body", legs: "Legs", swim: "Swim" } as const;
