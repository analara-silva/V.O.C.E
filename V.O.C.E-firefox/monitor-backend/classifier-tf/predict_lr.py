import sys
import pickle

# Carregar artefatos
with open("classifier-tf/model_lr.pkl", "rb") as f:
    model = pickle.load(f)

with open("classifier-tf/vectorizer.pkl", "rb") as f:
    vectorizer = pickle.load(f)

with open("classifier-tf/labels.pkl", "rb") as f:
    label_encoder = pickle.load(f)

# Pegar URL do argumento
url_to_classify = sys.argv[1]

# Transformar com TF-IDF
X_data = vectorizer.transform([url_to_classify])

# Predizer
prediction = model.predict(X_data)[0]
category = label_encoder.inverse_transform([prediction])[0]

print(category)