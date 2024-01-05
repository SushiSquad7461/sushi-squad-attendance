# sushi-squad-attendance
 
Functions requires Node.js 18

Recommended to set prettier to format on save

## Behavior

- Allows attendance to be logged from the website or from Notion directly.
    - For the purposes of counting attendance requirements, a meeting did not happen if there are no associated attendance logs, meaning it would not count against attendance requirements
- Attendance reports will be generated and sent to a Google spreadsheet every Sunday at 5:00 AM.
- When using the website
    - On regularly scheduled meeting days (hard coded), it will only allow the user to submit attendance during the meeting (or shortly before and after)
    - On days where there is no regularly scheduled meeting, submission will be blocked unless there is a pre-existing meeting for that day in the Notion Engineering Notebook
    - On regularly scheduled meeting days, upon a valid attendance submission request, the program will create a meeting in Notion if one does not exist (or exists without the correct date)
- When using Notion
    - The meeting should have a date assigned
    - The attendance report program expects that each attendance log will be associated with a meeting and have an assigned person
    - Do not assign multiple people to one attendance log