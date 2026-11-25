import { Class, DayOfWeek } from '../types';

const days: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export interface UpcomingClass {
  classItem: Class;
  startsAt: Date;
}

export function getNextClass(
  classes: Class[],
  now: Date = new Date(),
): UpcomingClass | null {
  let next: UpcomingClass | null = null;

  for (const classItem of classes) {
    const [hour, minute] = classItem.startTime.split(':').map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      continue;
    }

    for (let offset = 0; offset <= days.length; offset += 1) {
      const startsAt = new Date(now);
      startsAt.setDate(now.getDate() + offset);
      startsAt.setHours(hour, minute, 0, 0);

      if (
        days[startsAt.getDay()] === classItem.dayOfWeek &&
        startsAt.getTime() >= now.getTime() &&
        (next === null || startsAt.getTime() < next.startsAt.getTime())
      ) {
        next = { classItem, startsAt };
        break;
      }
    }
  }

  return next;
}
