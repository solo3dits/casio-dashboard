const ical = require('node-ical');

const TZ = 'Europe/London';
process.env.TZ = TZ;
const DIAS_EN = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

const ICS_CALENDARS = [
  process.env.CAL_ICS_1 && { name: process.env.CAL_NAME_1 || 'Calendar 1', url: process.env.CAL_ICS_1 },
  process.env.CAL_ICS_2 && { name: process.env.CAL_NAME_2 || 'Calendar 2', url: process.env.CAL_ICS_2 },
].filter(Boolean);

const APPS_SCRIPT_URL = process.env.CAL_APPS_SCRIPT_URL || null;

function toUKDateStr(date) {
  return new Date(date.toLocaleString('en-US', { timeZone: TZ })).toISOString().slice(0, 10);
}

async function parseICS(url, calName, todayStr, limitStr) {
  let events = [];
  try {
    const data = await ical.async.fromURL(url, { headers: { 'User-Agent': 'casio-dashboard/1.0' } });
    
    // Set our 7-day scanning window
    const rangeStart = new Date();
    rangeStart.setHours(0,0,0,0);
    const rangeEnd = new Date(rangeStart.getTime() + 7*24*60*60*1000);
    rangeEnd.setHours(23,59,59,999);

    for (let k in data) {
      if (!data.hasOwnProperty(k)) continue;
      let ev = data[k];
      if (ev.type !== 'VEVENT') continue;

      let title = ev.summary || '(no title)';
      
      const addEvent = (dateObj, isAllDay) => {
        let startStr = toUKDateStr(dateObj);
        if (startStr >= todayStr && startStr <= limitStr) {
          events.push({
            title: title,
            date: startStr,
            dayLabel: DIAS_EN[dateObj.getDay()],
            dateNum: startStr.slice(8,10) + '/' + startStr.slice(5,7),
            start: isAllDay ? null : dateObj.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone: TZ }),
            end: (!isAllDay && ev.end) ? new Date(ev.end).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone: TZ }) : null,
            allDay: isAllDay,
            calendar: calName,
            sortKey: startStr + (isAllDay ? 'T00:00' : dateObj.toISOString().slice(10))
          });
        }
      };

      // Check for recurrence rule (RRULE)
      if (ev.rrule) {
        let dates = ev.rrule.between(rangeStart, rangeEnd);
        dates.forEach(date => {
            let eventStart = new Date(ev.start);
            // Apply original event time to recurring instances
            date.setHours(eventStart.getHours(), eventStart.getMinutes(), eventStart.getSeconds());
            let isAllDay = !ev.start || (ev.start.getHours() === 0 && ev.start.getMinutes() === 0);
            addEvent(date, isAllDay);
        });
      } else {
         // Standard one-off event
         if (ev.start) {
             let isAllDay = (ev.start.getHours() === 0 && ev.start.getMinutes() === 0);
             addEvent(new Date(ev.start), isAllDay);
         }
      }
    }
  } catch (e) {
    console.error('Error '+calName+':', e.message);
  }
  return events;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  var secret = process.env.DASH_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    var now      = new Date();
    var todayStr = toUKDateStr(now);
    var limitStr = toUKDateStr(new Date(now.getTime() + 7*24*60*60*1000));
    var allEvents = [];

    if (APPS_SCRIPT_URL) {
      try {
        var resp = await fetch(APPS_SCRIPT_URL, { redirect: 'follow' });
        if (resp.ok) {
          var data = await resp.json();
          if (data.events) {
            data.events.forEach(ev => {
              if (ev.date >= todayStr && ev.date <= limitStr) {
                ev.sortKey = ev.date + (ev.allDay ? 'T00:00' : 'T'+(ev.start||'00:00'));
                allEvents.push(ev);
              }
            });
          }
        }
      } catch(e) { console.error('Error Apps Script:', e.message); }
    }

    // Process all ICS calendars using the new library
    for (var i=0; i<ICS_CALENDARS.length; i++) {
      allEvents = allEvents.concat(await parseICS(ICS_CALENDARS[i].url, ICS_CALENDARS[i].name, todayStr, limitStr));
    }

    allEvents.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    res.status(200).json({ events: allEvents, count: allEvents.length, today: todayStr });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
