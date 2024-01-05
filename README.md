# sushi-squad-attendance

This is the repository for the Sushi Squad Attendance system which attempts to automate the existing Notion attendance system as much as possible.

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
- Hard coded meeting schedule (Pacific Time)
    - Tuesday 4:00 PM - 7:00 PM
    - Wednesday 4:00 PM - 7:00 PM
    - Thursday 4:00 PM - 7:00 PM
    - Saturday 10:00 AM - 4:00 PM

## Development

Prerequisites
- Node.js 18 for Firebase functions
- Firebase CLI
- Notion account

Requirements
- A personal Notion workspace to test in with the proper configurations
    - Engineering Notebook database
        - Name - Title field
        - Date - Date field
        - Attendance Logs - Relation to Attendance database with no limit
    - Attendance database
        - Title - Title field
        - Person - Person field with a limit of 1
        - Engineering Notebook - Relation to Engineering Notebook with a limit of 1
    - Integration
        - Create an integration
        - Get its key/token
        - Connect it to the databases

- Create your own attendance sheet by running `yarn init-sheet`

- A few environment variables are needed to develop (stored in `firebase/functions/.env`)
    - `NOTION_TOKEN` - A token from a Notion integration with which you intend to test this program with (so from a private workspace)
    - `NOTION_BOT_USER_ID` - The user ID of the Notion integration bot, which can be retrieved by `GET https://api.notion.com/v1/users/me` with the Authorization header set to "Bearer \<insert Notion token here>"
    - `NOTION_ATTENDANCE_DBID` - The database ID of the attendance database you will use 
    - `NOTION_MEETINGS_DBID` - The database ID of the meetings/engineering notebook database you will use 
    - `GOOGLE_ATTENDANCE_SHEET_ID` - The spreadsheet ID of the Google spreadsheet you will use (from `init-sheet`)
    - `GOOGLE_ATTENDANCE_AGGREGATE_WORKSHEET_ID` - The sheet within the spreadsheet that will store the aggregated data (also from `init-sheet`)
    - `GOOGLE_SERVICE_ACCOUNT_EMAIL` - A google service account email that has the Google Drive and Google Sheets APIs connected/enabled
    - `GOOGLE_PRIVATE_KEY` - The private key for the google service account, obtainable from within the downloadable JSON key
    - `GOOGLE_SPREADSHEET_SHARE_EMAIL` - The email to share the test sheet with

Recommendations
- Set up VSCode Prettier extension to format on save
