// The texts read aloud on the "Teach the app my voice" screen (reading.js).
//
// Together they take about ten minutes. They are written with the words a speech
// model must learn for this app: requests to the assistant, days and times, family
// links, and many Israeli first names and places. Each paragraph is one string.
const ReadingTexts = [
  {
    title: 'Part 1 — A Sunday in Tel Aviv',
    paragraphs: [
      'Good morning. Today is Sunday, and the week starts in Tel Aviv. What do I have today? At nine in the morning I have a coffee with Elinor at Carmel coffee, next to the Carmel Market. Elinor is my sister. She lives in Givatayim, not far from Park Leumi in Ramat Gan. After the coffee I want to go to the pharmacy on Dizengoff Street, alone. Add it to my agenda at eleven.',
      'At noon I am seeing Lothan for lunch in Sarona. Lothan is my cousin, and she is working in chemistry at the Weizmann Institute in Rehovot. Remember that Lothan started a new job last month. Who is coming with her? Ilan is coming too. Ilan is my uncle, the brother of my mother. He lives in Haifa, on Mount Carmel, and he takes the train to Tel Aviv. Add a memo about Ilan: he does not eat fish.',
      'In the afternoon I have an appointment with Doctor Shapira at Ichilov hospital, at half past three. Move the appointment to four, please. No, cancel that. Keep it at half past three. Where is it? It is on Weizmann Street, on the second floor. My daughter Noa will drive me there. Noa lives in Herzliya with her husband Eitan and their two children, Maya and Omer.',
      'When do I see Saba? Saba is my grandfather. He is ninety one years old and he lives in Jerusalem, near the Mahane Yehuda market. I plan to visit him on Tuesday with my brother Yonatan. We take the bus from the Arlozorov station at ten in the morning. Remember that Saba likes the cake from the bakery in Rehavia.',
      'This evening Tamar and Avi are coming for dinner at seven. Tamar is my neighbour and Avi is her husband. They moved from Beer Sheva two years ago. What did I do yesterday? Yesterday was Shabbat. I had lunch at home with Yael, Moshe and Rivka, and in the afternoon we walked in Park HaYarkon.',
      'What time is it? It is a quarter past eight. What day is it? It is Sunday. Thank you. That is all for now.',
    ],
  },
  {
    title: 'Part 2 — People and how I know them',
    paragraphs: [
      'I want to add a few people. Add a new person, her name is Shira. Shira is my niece, the daughter of Yonatan. She is studying medicine at the Hebrew University in Jerusalem. Add a new person called Nadav. Nadav is my friend from the army. I met him in Eilat a long time ago, and now he lives in Kfar Saba with his wife Michal.',
      'Who is Dana? Dana is my aunt. She is the sister of my father, and she lives in Netanya, close to the sea. Her son Gal works at the port of Ashdod, and her daughter Ronit is a teacher in Petah Tikva. Ronit is married to Uri. Uri and Nadav know each other from work. How do I know Uri? I met him at the wedding of Ronit, in a garden near Caesarea.',
      'Give me some information about Lior. Lior is my nephew. He plays basketball in Holon on Monday and on Thursday, and on Friday morning he helps his grandmother Dvora in Bat Yam. Any news from Hila? Hila is the sister of Lior. Remember that Hila passed her driving test in Rishon LeZion. She is moving to Modiin next month with her friend Keren.',
      'Tal is my colleague. We worked together in Ramat Gan, in the tower next to the Diamond Exchange. Amit is his brother. Amit and Tal are twins, and I always mix them up. Memo about Amit. He has a beard, and Tal does not. Oren is my doctor for the eyes. His office is in Raanana, on Ahuza Street. Yossi is the man who repairs the car, in a garage in Bnei Brak.',
      'She is my aunt. He is my grandfather. They are my neighbours. Roni is my granddaughter and Ido is my grandson. Roni is seven and Ido is four. They live in Zichron Yaakov, and on the holidays we all meet at the Kinneret, in a house near Tiberias.',
      'Who is Elinor? How do I know Lothan? When do I see Ilan? Do you mean Ilana? No, I mean Ilan. Do you mean Saba? Yes. Is it Givatayim? Yes, Givatayim. Is it Leumi? Yes, Park Leumi, not alumni.',
    ],
  },
  {
    title: 'Part 3 — Plans, changes and short answers',
    paragraphs: [
      'What do I have tomorrow? Tomorrow is Monday. At eight in the morning I go to the swimming pool in Givatayim with Yael. At ten I have a meeting with Michal at Azrieli, on the third floor. At one I have lunch with Elinor and Lothan in Neve Tzedek. At five Noa brings Maya and Omer, and we go to the playground in Park Leumi.',
      'Add a coffee with Ilan on Wednesday at four at Carmel coffee. Add a dinner with Tamar and Avi on Thursday at eight in Jaffa. I plan to go to the Dead Sea on Friday with Yonatan and Shira. We leave at seven and we stop in Arad for breakfast. I want to go to the market in Ramla on Saturday night. Wanna go climbing with Elinor on Sunday? Let us go to the beach in Herzliya next week.',
      'Move the lunch with Elinor to two. Postpone the meeting with Michal to Tuesday. Change the place of the dinner to a restaurant on Rothschild Boulevard. Cancel my appointment with Doctor Shapira. Cancel the coffee on Wednesday. The dinner is now at half past eight. The meeting will be at the office in Petah Tikva.',
      'On which day? On Wednesday. At what time? At a quarter to six. Where is it? At Ben Gurion airport, terminal three. With whom? With Nadav and Dana. Alone. Nowhere. At home. Next to Tel Aviv. In Ramat Gan. In the afternoon. At noon. At midnight. In twenty minutes. In an hour.',
      'Yes. No. Yes, add it. No, cancel. Yeah. Okay. Sure. Of course. That is right. That is wrong. None of these. Say it again. What can I say? Stop. Hello. Shalom. Thank you very much.',
      'Remember that the keys are in the blue bowl next to the door. Remember that the radiator must be repaired before the winter. A memo: the code of the building is in my notebook. Search for the radiator. Where are my glasses? Where is my phone? What did I note about the pharmacy? Any news from Haifa? When is the birthday of Saba? It is in Kislev, a week before Hanukkah. That is the end of the text. Thank you for reading.',
    ],
  },
];
